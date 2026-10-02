import * as p from "@clack/prompts"
import path from "node:path"

import { ExtendedArray } from "#lib/utils/array.js"
import { CONFIG_FILENAME, readConfig, updateConfig } from "#lib/utils/config.js"
import { runPnpm, runPnpmJson } from "#lib/utils/pnpm.js"

/**
 * Uses native `pnpm pkg get` to check if types package is already declared in package.json.
 */
export async function isTypesPackageDeclared(typesPkg: string, cwd: string) {
  try {
    const { dependencies = {}, devDependencies = {} } = await runPnpmJson({
      command: "pkg",
      args: ["get", "dependencies", "devDependencies"],
      cwd,
    })
    return Object.hasOwn(dependencies, typesPkg) || Object.hasOwn(devDependencies, typesPkg)
  } catch {
    return false
  }
}

/**
 * Formats a package name according to DefinitelyTyped convention.
 * Replicates `types_package_name` from pnpm's add/types.rs.
 */
export function typesPackageName(name: string) {
  if (name.startsWith("@")) {
    return `@types/${name.slice(1).replace("/", "__")}`
  }
  return `@types/${name}`
}

/**
 * Replicates pnpm's internal `exports_types` checking from
 * `pnpm/crates/package-manager/src/add/types.rs`.
 *
 * Checks for direct "types" conditions, TS version-specific "types@<range>" conditions,
 * and recursively searches nested condition mappings.
 */
export function hasExportsTypes(exportsValue: unknown) {
  if (!exportsValue || typeof exportsValue !== "object") {
    return false
  }

  if (Array.isArray(exportsValue)) {
    return exportsValue.some(hasExportsTypes)
  }

  for (const [condition, target] of Object.entries(exportsValue)) {
    if (condition === "types" || condition.startsWith("types@")) {
      if (typeof target === "string" && target.length > 0) return true
      if (Array.isArray(target) && target.length > 0) return true
    }
    if (typeof target === "object" && target !== null && hasExportsTypes(target)) {
      return true
    }
  }

  return false
}

/**
 * Uses native `pnpm pkg get` to inspect the installed package inside `node_modules`.
 */
export async function hasBundledTypes(packageName: string, cwd: string): Promise<boolean> {
  const packageDir = path.join(cwd, "node_modules", packageName)
  try {
    const manifest = await runPnpmJson({
      command: "pkg",
      args: ["get", "types", "typings", "exports"],
      flags: ["--dir", packageDir],
      cwd,
    })

    if (
      manifest.types ||
      manifest.typings ||
      (manifest.exports && hasExportsTypes(manifest.exports))
    )
      return true
    return false
  } catch {
    return false
  }
}

/**
 * Checks if an active @types package exists on the registry and is not a
 * deprecated stub, reusing pnpm's companion selector logic (`package.deprecated.is_none()`).
 */
export async function isDefinitelyTypedAvailable(typesPkg: string, cwd: string) {
  try {
    const data = await runPnpmJson({
      command: "info",
      args: [typesPkg, "deprecated", "version"],
      cwd,
    })

    // If deprecated is set, DefinitelyTyped published a deprecation stub because
    // the package transitioned to bundling its own types.
    if (data.deprecated) {
      return false
    }

    return Boolean(data.version)
  } catch {
    return false
  }
}

/**
 * Checks whether `saveTypes` is already enabled in `pnpm-workspace.yaml`
 * using native `pnpm config get`.
 */
async function isSaveTypesConfigured(cwd: string) {
  try {
    const saveTypes = await runPnpmJson({ command: "config", args: ["get", "saveTypes"], cwd })
    return saveTypes ?? false
  } catch {
    return false
  }
}

/**
 * Sets `saveTypes: true` in `pnpm-workspace.yaml` using native `pnpm config set`.
 */
async function setSaveTypesWorkspaceSetting(cwd: string): Promise<void> {
  await runPnpm(["config", "set", "saveTypes", "true", "--location=project"], cwd)
}

const CREATE_NEW_CATALOG_VALUE = "Yes"

/**
 * Uses native `pnpm config get catalogs` / `pnpm config list` to read existing catalogs from pnpm-workspace.yaml.
 */
export async function getExistingCatalogs(cwd: string = process.cwd()) {
  try {
    const [catalogs = {}, defaultCatalog] = await Promise.all([
      runPnpmJson({
        command: "config",
        args: ["get", "catalogs"],
        cwd,
      }),
      runPnpmJson({
        command: "config",
        args: ["get", "catalog"],
        cwd,
      }),
    ])
    /**
     * The default catalog can be defined in 2 ways.
     * Users can specify a top-level "catalog" field or
     * An explicitly named "default" catalog under the "catalogs" map.
     *
     * It's an error to define the default catalog using both options,
     * but we still dedupe "default" keyword just in case.
     */
    return ExtendedArray.from([
      ...(defaultCatalog ? ["default"] : []),
      ...Object.keys(catalogs),
    ]).unique()
  } catch {
    return ExtendedArray.from([])
  }
}

/**
 * Prompts the user to select an existing catalog or create a new one.
 */
async function promptForCatalog(cwd: string): Promise<string | null> {
  const existingCatalogs = await getExistingCatalogs(cwd)

  const defaultChoice = existingCatalogs.includes("types")
    ? "types"
    : (existingCatalogs[0] ?? "types")

  const options = existingCatalogs.map((name) => ({
    value: name,
    label: `catalog:${name}`,
  }))

  options.push({
    value: CREATE_NEW_CATALOG_VALUE,
    label: "+ Create a new catalog...",
  })

  const selection = await p.select({
    message: "Which catalog should this type package be saved to?",
    options,
    initialValue: defaultChoice,
  })

  if (p.isCancel(selection)) return null

  if (selection === CREATE_NEW_CATALOG_VALUE) {
    const input = await p.text({
      message: "Enter the new catalog name:",
      placeholder: "types",
      validate: (val) => {
        if (!val?.trim()) return "Catalog name cannot be empty."
        if (!/^[a-zA-Z0-9-_]+$/.test(val.trim())) {
          return "Catalog name can only contain alphanumeric characters, hyphens, and underscores."
        }
        return undefined
      },
    })
    if (p.isCancel(input)) return null
    return input.trim()
  }

  return selection as string
}

/**
 * Post-install hook: checks if an installed package requires a DefinitelyTyped companion package,
 * prompts the user to install it, and offers to persist `saveTypes: true` in pnpm-workspace.yaml.
 *
 * @param packageName Name of the installed package (e.g. "lodash", "@scope/foo")
 * @param cwd Current working directory / workspace root
 */
/**
 * Post-install step handling companion @types installation and catalog routing.
 */
export async function promptForCompanionTypesStep(
  packageName: string,
  cwd: string = process.cwd(),
  isRootWorkspace: boolean = true,
): Promise<void> {
  // 1. Skip if the package is already a @types package
  if (packageName.startsWith("@types/")) return

  // 2. Inspect node_modules using native `pnpm pkg get`
  if (await hasBundledTypes(packageName, cwd)) return

  const typesPkg = typesPackageName(packageName)

  // 3. Check if already declared in workspace using native `pnpm pkg get`
  if (await isTypesPackageDeclared(typesPkg, cwd)) return

  // 4. Verify DefinitelyTyped availability via native `pnpm info`
  if (!(await isDefinitelyTypedAvailable(typesPkg, cwd))) return

  // 5. Check if `.nadarc` already has auto-install configured
  const { config } = await readConfig(cwd)
  const isAutoInstallEnabled = config.saveTypes === true
  const savedTypesCatalog = config.saveTypesCatalog

  let targetCatalog: string | null = null

  if (isAutoInstallEnabled && savedTypesCatalog) {
    // Automatically route to the configured catalog without prompting
    targetCatalog = savedTypesCatalog
  } else {
    // 6. Offer installation to user
    const shouldInstall = await p.confirm({
      message: `Package "${packageName}" does not provide built-in types, but "${typesPkg}" is available. Would you like to install it as a devDependency?`,
      initialValue: true,
    })

    if (p.isCancel(shouldInstall) || !shouldInstall) return

    // 7. Ask which catalog to save types to (separate from main package catalog)
    targetCatalog = await promptForCatalog(cwd)
    if (!targetCatalog) return
  }

  // 8. Execute `pnpm add -D <typesPkg> --save-catalog-name <catalog>`
  const s = p.spinner()
  s.start(`Installing ${typesPkg} into catalog "${targetCatalog}"...`)

  const addArgs = ["add", "-D", typesPkg, "--save-catalog-name", targetCatalog]
  if (isRootWorkspace) {
    addArgs.push("-w")
  }

  try {
    await runPnpm(addArgs, cwd)
    s.stop(`Installed ${typesPkg} into catalog:${targetCatalog}`)
  } catch (error) {
    s.stop(`Failed to install ${typesPkg}`)
    p.log.error(error instanceof Error ? error.message : String(error))
    return
  }

  // 9. If not configured yet, offer to persist in `.nadarc`
  if (!isAutoInstallEnabled || savedTypesCatalog !== targetCatalog) {
    const shouldPersist = await p.confirm({
      message: `To automatically save all future companion @types packages into catalog "${targetCatalog}" without prompting, would you like to save this preference?`,
      initialValue: true,
    })

    if (!p.isCancel(shouldPersist) && shouldPersist) {
      try {
        const { created } = await updateConfig(cwd, {
          saveTypes: true,
          saveTypesCatalog: targetCatalog,
        })

        if (created) {
          p.note(
            `A new "${CONFIG_FILENAME}" configuration file was created with your settings.\nDon't forget to commit "${CONFIG_FILENAME}" to version control!`,
            "Configuration Created",
          )
        } else {
          p.log.success(
            `Updated "${CONFIG_FILENAME}": set "saveTypes: true" and "saveTypesCatalog: ${targetCatalog}".`,
          )
        }
      } catch (err) {
        p.log.error(
          `Failed to update ${CONFIG_FILENAME}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }
}
