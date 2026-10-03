import { getPackageName, type PackageChoice } from "#lib/catalogs.js"
import { DEFAULT_CATALOG_NAME } from "#lib/constants.js"
import { stripAnsi } from "#lib/pnpm-process.js"
import type { WorkspaceTarget } from "#lib/workspace.js"

export interface Batch {
  /** `null` means "install without a catalog". */
  catalog: string | null
  target: WorkspaceTarget
  dev: boolean
  specs: string[]
}

export interface BatchResult {
  batch: Batch
  status: "installed" | "failed" | "skipped"
  code: number
  /** Package names pnpm reported as having unapproved build scripts. */
  ignoredBuilds: string[]
  /** True if pnpm reported ignored builds, even if no names could be parsed. */
  buildsPending: boolean
  /** Last lines of pnpm's output, only filled for failed batches. */
  errorTail: string[]
}

/** Groups projects that share (catalog, workspace, dependency type), in order of first appearance. */
export function groupIntoBatches(choices: readonly PackageChoice[]): Batch[] {
  const batches = new Map<string, Batch>()

  for (const choice of choices) {
    const key = JSON.stringify([choice.catalog, choice.target.path, choice.dev])
    const existing = batches.get(key)
    if (existing) {
      existing.specs.push(choice.spec)
    } else {
      batches.set(key, {
        catalog: choice.catalog,
        target: choice.target,
        dev: choice.dev,
        specs: [choice.spec],
      })
    }
  }

  return [...batches.values()]
}

/**
 * - the root target uses `-w`, members use `--filter` (set by the target's selector)
 * - `default` uses `--save-catalog`, other catalogs use `--save-catalog-name <name>`
 */
export function buildAddArgs(batch: Batch): string[] {
  const args = ["add", ...batch.target.selector]

  if (batch.dev) args.push("-D")

  if (batch.catalog === DEFAULT_CATALOG_NAME) {
    args.push("--save-catalog")
  } else if (batch.catalog !== null) {
    args.push("--save-catalog-name", batch.catalog)
  }

  args.push(...batch.specs)
  return args
}

export function describeCatalog(catalog: string | null): string {
  return catalog === null ? "no catalog" : `catalog: ${catalog}`
}

export function describeBatch(batch: Batch): string {
  const type = batch.dev ? "dev" : "prod"
  return `${batch.specs.join(", ")} → ${batch.target.label} · ${type} · ${describeCatalog(batch.catalog)}`
}

export interface IgnoredBuilds {
  /** pnpm mentioned ignored build scripts (as an error or as a warning). */
  detected: boolean
  /** The install failed with ERR_PNPM_IGNORED_BUILDS, as opposed to only warning. */
  failedBecauseOfBuilds: boolean
  names: string[]
}

const PACKAGE_SPEC_PATTERN = /^(@[\w.-]+\/)?[\w.-]+(@\S+)?$/

/**
 * Understands both of pnpm's formats:
 *   error:   `Ignored build scripts: esbuild@0.21.5`
 *   warning: `Ignored build scripts: sharp@0.34.5, unrs-resolver@1.12.2.`
 */
export function parseIgnoredBuilds(output: string): IgnoredBuilds {
  const text = stripAnsi(output)
  const failedBecauseOfBuilds = text.includes("ERR_PNPM_IGNORED_BUILDS")

  const lines = text.split("\n")
  const start = lines.findIndex((line) => line.includes("Ignored build scripts:"))
  const detected = failedBecauseOfBuilds || start !== -1

  if (start === -1) return { detected, failedBecauseOfBuilds, names: [] }

  let list = lines[start]?.split("Ignored build scripts:")[1] ?? ""

  // Long lists can wrap onto following lines. The list ends at a blank line,
  // a hint line, or (warning format) a trailing period.
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim()
    if (list.trim().endsWith(".")) break
    if (trimmed === "" || /help:/.test(trimmed) || trimmed.includes("approve-builds")) break
    list += ` ${trimmed}`
  }

  const names = list
    .split(",")
    .map((entry) => entry.trim().replace(/^[^\w@]+|[^\w]+$/g, ""))
    .filter((entry) => PACKAGE_SPEC_PATTERN.test(entry))
    .map(getPackageName)

  return { detected, failedBecauseOfBuilds, names: [...new Set(names)] }
}
