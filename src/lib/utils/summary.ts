import path from "node:path"

import { describeBatch, describeCatalog, type BatchResult } from "#lib/utils/batches.js"
import type { CatalogMode } from "#lib/utils/catalog-mode.js"
import { getPackageName, type PackageChoice } from "#lib/utils/catalogs.js"

export interface BuildsReport {
  /** pnpm reported ignored build scripts (even if no names could be parsed). */
  detected: boolean
  /** Names pnpm reported as having unapproved builds (may be empty if they couldn't be parsed). */
  reported: string[]
  /** The user ran `pnpm approve-builds` during this run. */
  ran: boolean
  approved: string[]
  denied: string[]
  pending: string[]
}

export interface SummaryInput {
  root: string
  isWorkspace: boolean
  results: readonly BatchResult[]
  choices: readonly PackageChoice[]
  /** Set when this run saved a new catalogMode. */
  catalogModeSet: CatalogMode | null
  builds: BuildsReport
  elapsedMs: number
}

const LABEL_WIDTH = 11

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function row(label: string, value: string): string {
  return `${label.padEnd(LABEL_WIDTH)}${value}`
}

function continuation(value: string): string {
  return `${" ".repeat(LABEL_WIDTH)}${value}`
}

function relativeManifest(root: string, directory: string): string {
  const relative = path.relative(root, directory).split(path.sep).join("/")
  return relative === "" ? "package.json" : `${relative}/package.json`
}

export function formatSummary(input: SummaryInput): string {
  const { root, isWorkspace, results, choices, catalogModeSet, builds, elapsedMs } = input

  const installed = results.filter((result) => result.status === "installed")
  const failed = results.filter((result) => result.status === "failed")
  const skipped = results.filter((result) => result.status === "skipped")

  const lines: string[] = []

  const packageCount = installed.reduce((total, result) => total + result.batch.specs.length, 0)
  lines.push(
    `Installed ${plural(packageCount, "package")} in ${plural(installed.length, "batch", "batches")} (${formatDuration(elapsedMs)})`,
  )

  /* ---- what went where ---- */

  const width = Math.max(0, ...installed.flatMap((r) => r.batch.specs.map((spec) => spec.length)))
  const byTarget = new Map<string, BatchResult[]>()
  for (const result of installed) {
    const group = byTarget.get(result.batch.target.label)
    if (group) group.push(result)
    else byTarget.set(result.batch.target.label, [result])
  }

  for (const [label, group] of byTarget) {
    lines.push("", label)
    for (const { batch } of group) {
      for (const spec of batch.specs) {
        lines.push(
          `  ${spec.padEnd(width)}  ${(batch.dev ? "dev" : "prod").padEnd(4)}  ${describeCatalog(batch.catalog)}`,
        )
      }
    }
  }

  /* ---- details ---- */

  const details: string[] = []

  if (catalogModeSet !== null) {
    details.push(row("Settings", `catalogMode set to "${catalogModeSet}"`))
  }

  const buildLines = formatBuilds(builds)
  buildLines.forEach((value, index) => {
    details.push(index === 0 ? row("Builds", value) : continuation(value))
  })

  if (installed.length > 0) {
    const files = new Set<string>()
    for (const { batch } of installed) files.add(relativeManifest(root, batch.target.path))
    const touchedWorkspaceFile =
      isWorkspace &&
      (catalogModeSet !== null ||
        builds.approved.length + builds.denied.length > 0 ||
        installed.some((result) => result.batch.catalog !== null))
    if (touchedWorkspaceFile) files.add("pnpm-workspace.yaml")
    files.add("pnpm-lock.yaml")
    details.push(row("Updated", [...files].join(", ")))
  }

  const alreadyThere = choices.filter(
    (choice) =>
      choice.existingRange !== undefined &&
      installed.some((result) => result.batch.specs.includes(choice.spec)),
  )
  alreadyThere.forEach((choice, index) => {
    const value = `${getPackageName(choice.spec)} was already in catalog "${choice.catalog}" (${choice.existingRange})`
    details.push(index === 0 ? row("Existing", value) : continuation(value))
  })

  if (details.length > 0) lines.push("", ...details)

  /* ---- failures ---- */

  for (const result of failed) {
    lines.push("", row("Failed", `${describeBatch(result.batch)} (exit ${result.code})`))
    for (const line of result.errorTail) lines.push(continuation(line))
  }

  skipped.forEach((result, index) => {
    if (index === 0) lines.push("")
    lines.push(row(index === 0 ? "Not run" : "", describeBatch(result.batch)))
  })

  return lines.join("\n")
}

function formatBuilds(builds: BuildsReport): string[] {
  if (!builds.detected) return []

  const parts: string[] = []
  if (builds.approved.length > 0) parts.push(`approved: ${builds.approved.join(", ")}`)
  if (builds.denied.length > 0) parts.push(`denied: ${builds.denied.join(", ")}`)
  if (builds.pending.length > 0) parts.push(`pending: ${builds.pending.join(", ")}`)

  if (parts.length === 0) {
    return [
      builds.ran
        ? "pnpm approve-builds was run"
        : "some dependencies have unapproved builds. Run `pnpm approve-builds` to review them.",
    ]
  }

  const lines = [parts.join(" · ")]
  if (builds.pending.length > 0) lines.push("Run `pnpm approve-builds` to review them.")
  return lines
}
