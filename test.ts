import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import util, { stripVTControlCharacters } from "node:util"
import semver from "semver"

import packageJson from "./package.json" with { type: "json" }
import child_process from 'child_process'

export interface EngineDependency {
  name: string
  version?: string
  onFail?: "ignore" | "warn" | "error" | "download"
}

type DevEngineKey = "os" | "cpu" | "libc" | "runtime" | "packageManager"

export type DevEngines = Partial<Record<DevEngineKey, EngineDependency | EngineDependency[]>>

function parseDevEnginesPackageManager(devEngines?: DevEngines): EngineDependency | undefined {
  if (!devEngines?.packageManager) return undefined
  let pmEngine: EngineDependency | undefined
  let onFail: "ignore" | "warn" | "error" | "download" | undefined
  if (Array.isArray(devEngines.packageManager)) {
    const engines = devEngines.packageManager
    if (engines.length === 0) return undefined
    if (engines.length === 0) return undefined
    const pnpmIndex = engines.findIndex((engine) => engine.name === "pnpm")
    if (pnpmIndex !== -1) {
      pmEngine = engines[pnpmIndex]
      // In array notation, default onFail is 'error' for the last element, 'ignore' for others.
      onFail = pmEngine.onFail ?? (pnpmIndex === engines.length - 1 ? "error" : "ignore")
    } else {
      pmEngine = engines[0]
      // No pnpm entry found — use the last element's onFail for the overall failure behavior.
      const lastEngine = engines[engines.length - 1]
      onFail = lastEngine.onFail ?? "error"
    }
  } else {
    pmEngine = devEngines.packageManager
    // Singular form: leave onFail undefined when the user did not set it, so
    // the central pmOnFail default ('download') applies. The array form keeps
    // its own per-element defaults ('error' for the last entry, 'ignore' for
    // the rest) because those reflect explicit prioritization by the user.
    onFail = pmEngine.onFail
  }
  if (!pmEngine?.name) return undefined
  return {
    name: pmEngine.name,
    version: pmEngine.version,
    onFail,
  }
}

export interface ParsedPackageManager {
  name: string
  version: string | undefined
  hash: string | undefined
}

function splitPackageManagerVersion(reference: string | undefined): {
  version: string | undefined
  hash: string | undefined
} {
  if (reference == null) return { version: undefined, hash: undefined }
  // Split on the first `+` only. The integrity hash is semver build metadata —
  // everything after that `+` — and must be preserved whole, so a reference is
  // never truncated at a later `+`.
  const hashIndex = reference.indexOf("+")
  if (hashIndex === -1) return { version: reference, hash: undefined }
  return { version: reference.slice(0, hashIndex), hash: reference.slice(hashIndex + 1) }
}

export function parsePackageManager(packageManager: string): ParsedPackageManager {
  // Split on the `@` that separates the name from the reference. A leading `@`
  // belongs to a scoped name (e.g. `@scope/pm@1.2.3`), so skip it; otherwise
  // the first `@` is the separator. The first `@` (not the last) is used so a
  // reference that is a URL containing `@` (e.g. credentials) stays intact.
  const separatorIndex = packageManager.startsWith("@")
    ? packageManager.indexOf("@", 1)
    : packageManager.indexOf("@")
  if (separatorIndex === -1) return { name: packageManager, version: undefined, hash: undefined }
  const name = packageManager.slice(0, separatorIndex)
  const pmReference = packageManager.slice(separatorIndex + 1)
  // pmReference is semantic versioning, not URL
  if (pmReference.includes(":")) return { name, version: undefined, hash: undefined }
  return { name, ...splitPackageManagerVersion(pmReference) }
}

export type Dependencies = Record<string, string>

export type PackageBin = string | { [commandName: string]: string }

export interface ProjectManifest extends BaseManifest {
  packageManager?: string
  workspaces?: string[] // TODO: add Record<string, string> to represent npm (to be compatible with @npm/types)
  private?: boolean
  resolutions?: Record<string, string>
}

export type PackageScripts = {
  [name: string]: string
} & {
  prepublish?: string
  prepare?: string
  prepublishOnly?: string
  prepack?: string
  postpack?: string
  publish?: string
  postpublish?: string
  preinstall?: string
  install?: string
  postinstall?: string
  preuninstall?: string
  uninstall?: string
  postuninstall?: string
  preversion?: string
  version?: string
  postversion?: string
  pretest?: string
  test?: string
  posttest?: string
  prestop?: string
  stop?: string
  poststop?: string
  prestart?: string
  start?: string
  poststart?: string
  prerestart?: string
  restart?: string
  postrestart?: string
  preshrinkwrap?: string
  shrinkwrap?: string
  postshrinkwrap?: string
}

export interface PeerDependenciesMeta {
  [dependencyName: string]: {
    optional?: boolean
  }
}

export interface DependenciesMeta {
  [dependencyName: string]: {
    injected?: boolean
    patch?: string
  }
}

export interface PublishConfig extends Record<string, unknown> {
  access?: "public" | "restricted"
  directory?: string
  /**
   * Publishes the package under a different name than the one its manifest
   * carries in the workspace — for a project whose name is already taken by a
   * sibling. Only the published artifact is renamed; dependents, the lockfile,
   * and release tooling keep addressing the project by its manifest name.
   */
  name?: string
  linkDirectory?: boolean
  executableFiles?: string[]
  registry?: string
}

type Version = string
type Pattern = string

export interface TypesVersions {
  [version: Version]: {
    [pattern: Pattern]: string[]
  }
}

export interface BaseManifest {
  name?: string
  version?: string
  type?: string
  bin?: PackageBin
  description?: string
  directories?: {
    bin?: string
  }
  files?: string[]
  funding?: string
  dependencies?: Dependencies
  devDependencies?: Dependencies
  optionalDependencies?: Dependencies
  peerDependencies?: Dependencies
  peerDependenciesMeta?: PeerDependenciesMeta
  dependenciesMeta?: DependenciesMeta
  bundleDependencies?: string[] | boolean
  bundledDependencies?: string[] | boolean
  homepage?: string
  repository?: string | { url: string }
  bugs?:
    | string
    | {
        url?: string
        email?: string
      }
  scripts?: PackageScripts
  config?: Record<string, unknown>
  engines?: {
    node?: string
    npm?: string
    pnpm?: string
  } & Pick<DevEngines, "runtime">
  devEngines?: DevEngines
  cpu?: string[]
  os?: string[]
  libc?: string[]
  main?: string
  module?: string
  typings?: string
  types?: string
  publishConfig?: PublishConfig
  typesVersions?: TypesVersions
  readme?: string
  keywords?: string[]
  author?: string
  license?: string
  exports?: Record<string, string>
  imports?: Record<string, unknown>
}

export interface WantedPackageManager extends EngineDependency {
  fromDevEngines?: boolean
}

/**
 * Renders a package.json-controlled value safe to embed in a warning printed to
 * the terminal. Strips ANSI escape sequences and replaces remaining control
 * characters (including newlines) with spaces so a malicious manifest cannot
 * forge or rewrite terminal/CI log output.
 */
function sanitizeManifestValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  return stripVTControlCharacters(value).replace(/[\u0000-\u001f\u007f]/g, " ")
}

function getPackageManagerConflictWarning(
  legacy: ParsedPackageManager,
  devEngines: ParsedPackageManager,
): string | undefined {
  const ignoredSuffix = '. "packageManager" will be ignored'
  const genericWarning = `Cannot use both "packageManager" and "devEngines.packageManager" in package.json${ignoredSuffix}`
  if (legacy.name !== devEngines.name) {
    return `"packageManager" (${sanitizeManifestValue(legacy.name)}) and "devEngines.packageManager" (${sanitizeManifestValue(devEngines.name)}) specify different package managers in package.json${ignoredSuffix}`
  }
  if (legacy.version !== devEngines.version) {
    // "different versions" only makes sense when both sides are concrete
    // versions. If one side has no semver version — e.g. the legacy field is a
    // URL or a bare name — fall back to the generic notice rather than claiming
    // a version mismatch.
    if (legacy.version == null || devEngines.version == null) return genericWarning
    return `"packageManager" and "devEngines.packageManager" specify different versions of ${sanitizeManifestValue(legacy.name)} in package.json${ignoredSuffix}`
  }
  if (legacy.hash !== devEngines.hash) {
    // Same name and version, but the integrity hashes differ. Two distinct
    // hashes for one version is a likely wrong-hash mistake, so call it out
    // specifically; a hash on only one side is a softer mismatch (the version
    // still agrees) and gets the generic notice.
    if (legacy.hash != null && devEngines.hash != null && legacy.version != null) {
      return `"packageManager" and "devEngines.packageManager" specify ${sanitizeManifestValue(legacy.name)}@${sanitizeManifestValue(legacy.version)} with different integrity hashes in package.json${ignoredSuffix}`
    }
    return genericWarning
  }
  return undefined
}

function getWantedPackageManager(manifest: ProjectManifest): {
  pm?: WantedPackageManager
  warnings: string[]
} {
  const warnings: string[] = []
  const pmFromDevEngines = parseDevEnginesPackageManager(manifest.devEngines)
  if (pmFromDevEngines) {
    if (pmFromDevEngines.version != null && !semver.validRange(pmFromDevEngines.version)) {
      warnings.push(
        `Cannot use devEngines.packageManager version "${pmFromDevEngines.version}": not a valid version or range`,
      )
      pmFromDevEngines.version = undefined
    }
    if (manifest.packageManager) {
      const legacyPm = parsePackageManager(manifest.packageManager)
      const conflictWarning = getPackageManagerConflictWarning(legacyPm, {
        name: pmFromDevEngines.name,
        ...splitPackageManagerVersion(pmFromDevEngines.version),
      })
      if (conflictWarning) {
        warnings.push(conflictWarning)
      }
    }
    return { pm: { ...pmFromDevEngines, fromDevEngines: true }, warnings }
  }
  if (manifest.packageManager) {
    const pm = parsePackageManager(manifest.packageManager)
    if (pm.version != null) {
      const cleanVersion = semver.valid(pm.version)
      if (!cleanVersion) {
        warnings.push(
          `Cannot use packageManager "${manifest.packageManager}": "${pm.version}" is not a valid exact version`,
        )
        pm.version = undefined
      } else if (cleanVersion !== pm.version) {
        warnings.push(
          `Cannot use packageManager "${manifest.packageManager}": you need to specify the version as "${cleanVersion}"`,
        )
        pm.version = undefined
      }
    }
    return { pm, warnings }
  }
  return { warnings }
}

// `lockfileDir` moves `rootProjectManifestDir` off the workspace root,
// and the engine pins stay with the workspace the contributor works in.
// Re-read only when the two directories differ.
const config = JSON.parse(child_process.execFileSync("pnpm", ["config", "list", "--json"]).toString().trim());
console.log(config)
const enginePinManifestDir = config.workspaceDir ?? config.dir
config.enginePinManifest = enginePinManifestDir === config.rootProjectManifestDir
  ? config.rootProjectManifest
  : undefined
if (config.enginePinManifest != null) {
  const wantedPmResult = getWantedPackageManager(config)
  if (wantedPmResult.pm) {
    config.wantedPackageManager = wantedPmResult.pm
  }
  console.log(...wantedPmResult.warnings)
}

