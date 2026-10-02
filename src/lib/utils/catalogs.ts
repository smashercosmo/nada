import { confirm, log, select, text } from "@clack/prompts"

import { isRecord } from "#lib/utils/guards.js"
import { DEFAULT_CATALOG_NAME } from "#lib/utils/constants.js"
import { runPnpmJson } from "#lib/utils/pnpm.js"
import { unwrap } from "#lib/utils/prompts.js"
import type { WorkspaceTarget } from "#lib/utils/workspace.js"

/** catalog name -> package name -> version range */
export type CatalogContents = Record<string, Record<string, string>>

export interface PackageChoice {
  /** e.g. `lodash@4.18.1` */
  spec: string
  target: WorkspaceTarget
  dev: boolean
  /** `null` means "install without a catalog". */
  catalog: string | null
  /** Version range already present in the chosen catalog, if any. */
  existingRange?: string
}

const CATALOG_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

/**
 * Sentinels for select options. They can never collide with a real catalog
 * name, because names must start with a letter or a digit.
 */
const CREATE_NEW_OPTION = "__create_new__"
const NO_CATALOG_OPTION = "__no_catalog__"

/** `lodash@4.1.0` -> `lodash`, `@scope/pkg@1.0.0` -> `@scope/pkg`, `pkg` -> `pkg` */
export function getPackageName(spec: string): string {
  const versionSeparator = spec.indexOf("@", 1)
  return versionSeparator === -1 ? spec : spec.slice(0, versionSeparator)
}

/* -------------------------------------------------------------------------- */
/* Reading catalogs                                                           */
/* -------------------------------------------------------------------------- */

async function readPnpmConfigValue(cwd: string, key: "catalog" | "catalogs"): Promise<unknown> {
  try {
    return await runPnpmJson({ command: "config", args: ["get", key], cwd })
  } catch {
    // `pnpm config get` prints `null` (or fails) when the key isn't set.
    return undefined
  }
}

function toEntries(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const entries: Record<string, string> = {}
  for (const [name, range] of Object.entries(value)) {
    if (typeof range === "string") entries[name] = range
  }
  return entries
}

export async function readCatalogContents(cwd: string): Promise<CatalogContents> {
  const [catalog, catalogs] = await Promise.all([
    readPnpmConfigValue(cwd, "catalog"),
    readPnpmConfigValue(cwd, "catalogs"),
  ])

  const contents: CatalogContents = {}

  if (isRecord(catalogs)) {
    for (const [name, entries] of Object.entries(catalogs)) {
      contents[name] = toEntries(entries)
    }
  }

  // `catalog:` is the default catalog; merge with `catalogs.default:` if both exist.
  const defaultEntries = toEntries(catalog)
  if (Object.keys(defaultEntries).length > 0) {
    contents[DEFAULT_CATALOG_NAME] = { ...contents[DEFAULT_CATALOG_NAME], ...defaultEntries }
  }

  return contents
}

/* -------------------------------------------------------------------------- */
/* Prompts                                                                    */
/* -------------------------------------------------------------------------- */

interface CatalogState {
  /** Existing catalogs plus the ones created during this run. */
  known: Set<string>
  /** Ordered list shown in the catalog select. `default` is always first. */
  available: string[]
}

async function askNewCatalog(state: CatalogState): Promise<string> {
  const answer = unwrap(
    await text({
      message: "Catalog name",
      placeholder: "e.g. react18, tooling",
      validate: (input) => {
        const name = (input ?? "").trim()
        if (name === DEFAULT_CATALOG_NAME) {
          return `"${DEFAULT_CATALOG_NAME}" is reserved. Pick it from the list instead of creating it.`
        }
        if (!CATALOG_NAME_PATTERN.test(name)) {
          return "Use lowercase letters, digits, '.', '_' or '-', starting with a letter or digit."
        }
        return undefined
      },
    }),
  )

  const name = answer.trim()

  if (state.known.has(name)) {
    log.info(`Using existing catalog "${name}".`)
  } else {
    state.known.add(name)
    state.available.push(name)
  }

  return name
}

async function askTarget(
  spec: string,
  targets: readonly WorkspaceTarget[],
  previous: WorkspaceTarget | undefined,
): Promise<WorkspaceTarget> {
  const chosenPath = unwrap(
    await select<string>({
      message: `Which workspace should ${spec} be installed in?`,
      options: targets.map((target) => ({ value: target.path, label: target.label })),
      ...(previous === undefined ? {} : { initialValue: previous.path }),
    }),
  )

  const target = targets.find((candidate) => candidate.path === chosenPath)
  if (!target) throw new Error(`Unknown workspace "${chosenPath}".`)
  return target
}

async function askCatalog(options: {
  spec: string
  state: CatalogState
  contents: CatalogContents
  allowNoCatalog: boolean
  previous: string | null | undefined
}): Promise<string | null> {
  const { spec, state, contents, allowNoCatalog, previous } = options
  const packageName = getPackageName(spec)

  const choices: { value: string; label: string; hint?: string }[] = state.available.map(
    (catalog) => {
      const range = contents[catalog]?.[packageName]
      return range === undefined
        ? { value: catalog, label: catalog }
        : { value: catalog, label: catalog, hint: `has ${packageName}@${range}` }
    },
  )
  choices.push({ value: CREATE_NEW_OPTION, label: "＋ Create new catalog" })
  if (allowNoCatalog) choices.push({ value: NO_CATALOG_OPTION, label: "No catalog" })

  const initialValue =
    previous === null ? (allowNoCatalog ? NO_CATALOG_OPTION : undefined) : previous

  const choice = unwrap(
    await select<string>({
      message: `Which catalog should ${spec} go into?`,
      options: choices,
      ...(initialValue === undefined ? {} : { initialValue }),
    }),
  )

  if (choice === NO_CATALOG_OPTION) return null
  if (choice === CREATE_NEW_OPTION) return await askNewCatalog(state)
  return choice
}

/**
 * Asks, for every package: workspace, "is it a dev dependency?", catalog.
 * Each prompt pre-selects the previous package's answer.
 */
export async function askPackageChoices(options: {
  packages: readonly string[]
  targets: readonly WorkspaceTarget[]
  /** False outside a workspace: catalogs don't apply and are never asked about. */
  catalogsEnabled: boolean
  /** True when `catalogMode` is unset or `manual`. */
  allowNoCatalog: boolean
  existingCatalogs: readonly string[]
  contents: CatalogContents
}): Promise<PackageChoice[]> {
  const { packages, targets, catalogsEnabled, allowNoCatalog, existingCatalogs, contents } = options

  const state: CatalogState = {
    known: new Set([DEFAULT_CATALOG_NAME, ...existingCatalogs]),
    available: [
      DEFAULT_CATALOG_NAME,
      ...existingCatalogs.filter((catalog) => catalog !== DEFAULT_CATALOG_NAME),
    ],
  }

  // The workspace prompt is skipped only when there is exactly one possible target.
  const [onlyTarget] = targets
  const singleTarget = targets.length === 1 ? onlyTarget : undefined

  const choices: PackageChoice[] = []
  let previousTarget: WorkspaceTarget | undefined
  let previousDev: boolean | undefined
  let previousCatalog: string | null | undefined

  for (const spec of packages) {
    const target = singleTarget ?? (await askTarget(spec, targets, previousTarget))

    const dev = unwrap(
      await confirm({
        message: `Is ${spec} a dev dependency?`,
        initialValue: previousDev ?? false,
      }),
    )

    const catalog = catalogsEnabled
      ? await askCatalog({ spec, state, contents, allowNoCatalog, previous: previousCatalog })
      : null

    const existingRange =
      catalog === null ? undefined : contents[catalog]?.[getPackageName(spec)]

    choices.push({
      spec,
      target,
      dev,
      catalog,
      ...(existingRange === undefined ? {} : { existingRange }),
    })

    previousTarget = target
    previousDev = dev
    if (catalogsEnabled) previousCatalog = catalog
  }

  return choices
}
