import type { Catalog } from "@pnpm/catalogs.types"
import type { Config as _Config } from "@pnpm/config.reader"
import type { PackageDependencyHierarchy } from "@pnpm/deps.inspection.list"
import type { PackageInRegistry } from "@pnpm/resolving.registry.types"
import type { ProjectManifest } from "@pnpm/types"
import type { ChildProcess, SpawnOptions } from "node:child_process"

import child_process from "node:child_process"
import console from "node:console"
import process from "node:process"
import os from "node:os"

import { DEFAULT_CATALOG_NAME, SUPPORTED_PACKAGE_MANAGER } from "#lib/utils/constants.js"
import {
  ProcessError,
  spawn,
  spawnProcessAndCaptureResult,
  type SpawnProcessAndCaptureResultOptions,
} from "#lib/utils/spawn.js"

interface WorkspaceProject {
  name: string
  path: string
}

/**
 * pnpm hasn't yet updated its types with a new `saveTypes` option.
 */
type Config = _Config & { saveTypes?: boolean; catalog?: Catalog }
type PnpmCommand = "info" | "pkg" | "config" | "list"
type PnpmCommandArgs<TCommand extends PnpmCommand> = TCommand extends "info"
  ? [string, ...(keyof PackageInRegistry)[]]
  : TCommand extends "list"
    ? ["--recursive", "--depth", "-1"]
    : TCommand extends "pkg"
      ? ["get"] | ["get", ...(keyof ProjectManifest | (string & {}))[]]
      : ["list"] | ["get", keyof Config]

type PnpmCommandReturnValue<
  TCommand extends PnpmCommand,
  TArgs extends PnpmCommandArgs<TCommand>,
> = TCommand extends "info"
  ? TArgs extends [string, ...infer TProperties extends string[]]
    ? TProperties extends [...(keyof PackageInRegistry)[]]
      ? Pick<PackageInRegistry, TProperties[number] | "name">
      : PackageInRegistry
    : unknown
  : TCommand extends "list"
    ? Pick<PackageDependencyHierarchy, "name" | "path">[]
    : TCommand extends "pkg"
      ? TArgs extends ["get", ...infer TProperties extends string[]]
        ? TProperties extends [...(keyof ProjectManifest)[]]
          ? Pick<ProjectManifest, TProperties[number] | "name">
          : ProjectManifest
        : unknown
      : TCommand extends "config"
        ? TArgs extends ["list"]
          ? Config
          : TArgs extends ["get", infer TProperty extends string]
            ? TProperty extends keyof Config
              ? Config[TProperty]
              : unknown
            : unknown
        : unknown

/**
 * @param {object} options
 * @param {PnpmCommand} options.command - pnpm command to run
 * @param {string[]} options.args - pnpm command arguments
 * @param {string[]} options.flags - additional arguments, whose names start with "--"
 * @param {string} options.cwd - working directory from which the process is spawned
 */
export async function runPnpmJson<
  TCommand extends PnpmCommand,
  const TArgs extends PnpmCommandArgs<TCommand>,
>(options: { command: TCommand; args?: TArgs; flags?: string[]; cwd?: string }) {
  const { args: _args = [], flags = [], command, cwd = process.cwd() } = options
  const args = [
    command,
    ...[...new Set(command === "info" || command === "pkg" ? [..._args, "name"] : _args)],
    ...flags,
    "--json",
  ]
  const [stdout, stderr] = await spawnProcessAndCaptureResult({
    command: "pnpm",
    args,
    cwd,
  })

  if (stdout === undefined) {
    throw stderr;
  }

  try {
    return JSON.parse(stdout.trim()) as PnpmCommandReturnValue<TCommand, TArgs>
  } catch (error) {
    if (process.env.NADA_REPORTER === "verbose") {
      if (error instanceof ProcessError) {
        console.error(
            [`Original error: ${error.message}`,
            `Failed command: \`pnpm ${command} ${args.join(" ")}\``].join(os.EOL),
        )
      }
      console.error(error instanceof Error ? error.message : "Failed to parse JSON.")
    }
    return undefined
  }
}

/**
 * The subset of `child_process.spawn` that this module needs.
 *
 * Why inject `spawn` instead of mocking `node:child_process`?
 *
 * - It keeps production code on the normal Node API.
 * - Tests can deterministically decide when a child emits data, `error`, or
 *   `close` without depending on the operating system scheduler.
 * - We do not need a test-framework-specific module-mocking mechanism.
 *
 * The returned value is the real Node `ChildProcess` abstraction. Our tests
 * use a small EventEmitter-based stand-in for most cases and a real
 * ChildProcess for the particularly subtle double-`error` regression test.
 */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess

/**
 * Raised when pnpm successfully starts but reports that dependency build
 * scripts were ignored because they have not been approved.
 *
 * This is deliberately a distinct error type. Callers can tell the difference
 * between an ordinary failed `pnpm` command and the special case where the
 * user needs to approve build scripts and retry.
 */
export class PnpmIgnoredBuildsError extends Error {
  public constructor() {
    super("pnpm ignored build scripts for unapproved dependencies")
    this.name = "PnpmIgnoredBuildsError"
  }
}

export interface AddOptions {
  cwd?: string
  /** Package specs, e.g. `lodash@4.18.1`. */
  packages: readonly string[]
  /**
   * - omitted: plain `pnpm add`, no catalog
   * - "default": `--save-catalog`
   * - anything else: `--save-catalog-name <name>`
   */
  catalogName?: string
}

export function buildAddArgs(options: Pick<AddOptions, "packages" | "catalogName">): string[] {
  const args = ["add"]

  if (options.catalogName === DEFAULT_CATALOG_NAME) {
    args.push("--save-catalog")
  } else if (options.catalogName !== undefined) {
    args.push("--save-catalog-name", options.catalogName)
  }

  args.push(...options.packages)
  return args
}

export async function runPackageAddCommand(
  options: AddOptions,
  spawnImpl: SpawnFn = child_process.spawn,
): Promise<number> {
  const result = await spawn({
    command: "pnpm",
    args: buildAddArgs(options),
    cwd: options.cwd,
    spawnImpl,
    stdin: "inherit",
    stdout: "inherit",
  })

  return result.code
}

/**
 * Runs a pnpm command with stdin inherited but stdout/stderr piped through the
 * parent process.
 *
 * This mode is useful when a caller wants pnpm to remain interactive while
 * still wrapping its output (for example, to prefix each line in a UI). The
 * implementation is intentionally kept in the same lifecycle wrapper as the
 * other modes so signal forwarding, error handling, buffering, and cleanup do
 * not drift between variants.
 */
export async function execPnpmInteractivePipe(
  args: readonly string[],
  cwd: string = process.cwd(),
  spawnImpl: SpawnFn = child_process.spawn,
): Promise<number> {
  const result = await spawn({
    command: "pnpm",
    args,
    cwd,
    spawnImpl,
    stdin: "inherit",
    stdout: "pipe",
  })

  return result.code
}

/**
 * Runs an arbitrary pnpm command with captured stdout/stderr.
 */
export async function runPnpmCommandAndCaptureResult(
  args: readonly string[],
  cwd: string = process.cwd(),
  spawnImpl: SpawnFn = child_process.spawn,
) {
  return spawnProcessAndCaptureResult({
    command: "pnpm",
    args: args,
    cwd: cwd,
    spawnImpl: spawnImpl,
  })
}

export async function checkIfPnpmIsAvailable() {
  try {
    const command = process.platform === "win32" ? `where` : `command`
    const args =
      process.platform === "win32" ? [SUPPORTED_PACKAGE_MANAGER] : ["-v", SUPPORTED_PACKAGE_MANAGER]
    child_process.execFileSync(command, args, { stdio: "ignore", env: process.env })
    return true
  } catch {
    return false
  }
}

export async function getCurrentPnpmVersion(
  options?: Omit<SpawnProcessAndCaptureResultOptions, "command" | "args">,
) {
  return spawnProcessAndCaptureResult({ command: "pnpm", args: ["--version"], ...options })
}

export async function getPackageInfo(pkg: string) {
  return spawnProcessAndCaptureResult({ command: "pnpm", args: ["view", pkg] })
}

/**
 * Lists workspace projects using pnpm itself instead of trying to duplicate
 * pnpm's package-glob/negation resolution in this tool.
 */
export async function getWorkspaceProjects(
  cwd: string = process.cwd(),
  spawnImpl: SpawnFn = child_process.spawn,
): Promise<WorkspaceProject[]> {
  const args = ["list", "-r", "--depth", "-1", "--json"] as const
  const [stdout, error] = await spawnProcessAndCaptureResult({
    command: "pnpm",
    args: args,
    cwd: cwd,
    spawnImpl: spawnImpl,
  })

  if (error) {
    throw error
  }

  // JSON parsing intentionally happens after process-success validation. A
  // Malformed response therefore becomes a SyntaxError rather than being
  // Mistaken for a pnpm process failure.
  const parsed = JSON.parse(stdout) as unknown

  if (!Array.isArray(parsed)) {
    throw new TypeError("pnpm list returned JSON, but the top-level value was not an array.")
  }

  return parsed
    .filter((entry): entry is { name: string; path: string } => {
      if (!entry || typeof entry !== "object") {
        return false
      }
      const value = entry as Record<string, unknown>
      return (
        typeof value["name"] === "string" &&
        value["name"].length > 0 &&
        typeof value["path"] === "string"
      )
    })
    .map((entry) => ({ name: entry.name, path: entry.path }))
}
