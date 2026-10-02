import { confirm, log, note, outro, spinner } from "@clack/prompts"
import process from "node:process"

import {
  buildAddArgs,
  describeBatch,
  groupIntoBatches,
  parseIgnoredBuilds,
  type Batch,
  type BatchResult,
} from "#lib/utils/batches.js"
import { resolveCatalogMode } from "#lib/utils/catalog-mode.js"
import { askPackageChoices, readCatalogContents } from "#lib/utils/catalogs.js"
import { isRecord } from "#lib/utils/guards.js"
import { getExistingCatalogs } from "#lib/utils/packages.js"
import { runPnpmJson } from "#lib/utils/pnpm.js"
import { runPnpm, tailLines } from "#lib/utils/pnpm-process.js"
import { unwrap } from "#lib/utils/prompts.js"
import { formatSummary, type BuildsReport } from "#lib/utils/summary.js"
import { readWorkspaceContext } from "#lib/utils/workspace.js"

/* -------------------------------------------------------------------------- */
/* Running batches                                                            */
/* -------------------------------------------------------------------------- */

async function runBatch(
  batch: Batch,
  options: { root: string; debug: boolean },
): Promise<BatchResult> {
  const description = describeBatch(batch)

  // In debug mode pnpm's raw output is streamed, which doesn't mix with a spinner.
  const progress = options.debug ? undefined : spinner()
  if (progress) progress.start(`Installing ${description}`)
  else log.step(`Installing ${description}`)

  const result = await runPnpm(buildAddArgs(batch), {
    cwd: options.root,
    mode: "capture",
    echo: options.debug,
  })

  const ignored = parseIgnoredBuilds(result.output)

  // pnpm exits non-zero with ERR_PNPM_IGNORED_BUILDS even though the packages
  // were installed and the manifest was updated. That is not a failure.
  const succeeded = result.code === 0 || ignored.failedBecauseOfBuilds

  if (succeeded) {
    progress?.stop(
      ignored.detected
        ? `Installed ${description} (builds need approval)`
        : `Installed ${description}`,
    )
    return {
      batch,
      status: "installed",
      code: 0,
      ignoredBuilds: ignored.names,
      buildsPending: ignored.detected,
      errorTail: [],
    }
  }

  progress?.error(`Failed to install ${description}`)
  return {
    batch,
    status: "failed",
    code: result.code,
    ignoredBuilds: [],
    buildsPending: false,
    errorTail: tailLines(result.output),
  }
}

/** Runs batches in order. After the first real failure the remaining ones are skipped. */
export async function runBatches(
  batches: readonly Batch[],
  options: { root: string; debug: boolean },
): Promise<BatchResult[]> {
  const results: BatchResult[] = []
  let failed = false

  for (const batch of batches) {
    if (failed) {
      results.push({
        batch,
        status: "skipped",
        code: 0,
        ignoredBuilds: [],
        buildsPending: false,
        errorTail: [],
      })
      continue
    }

    const result = await runBatch(batch, options)
    results.push(result)
    if (result.status === "failed") failed = true
  }

  return results
}

/* -------------------------------------------------------------------------- */
/* Ignored builds                                                             */
/* -------------------------------------------------------------------------- */

async function readAllowBuilds(cwd: string): Promise<Record<string, boolean>> {
  try {
    const value: unknown = await runPnpmJson({ command: "config", args: ["get", "allowBuilds"], cwd })
    if (!isRecord(value)) return {}

    const allowed: Record<string, boolean> = {}
    for (const [name, decision] of Object.entries(value)) {
      if (typeof decision === "boolean") allowed[name] = decision
    }
    return allowed
  } catch {
    return {}
  }
}

/**
 * Explains why approval is needed and, if the user agrees, hands the terminal
 * over to pnpm's own interactive picker. pnpm 12 runs approved builds as part
 * of approval, so there is no separate rebuild step.
 */
async function offerApproveBuilds(root: string, names: readonly string[]): Promise<BuildsReport> {
  log.warn(
    names.length > 0
      ? `Some dependencies need to be allowed to run their build scripts: ${names.join(", ")}.`
      : "Some dependencies need to be allowed to run their build scripts.",
  )

  const wantsApproval = unwrap(
    await confirm({ message: "Do you want to run pnpm approve-builds now?", initialValue: true }),
  )

  if (!wantsApproval) {
    return { detected: true, reported: [...names], ran: false, approved: [], denied: [], pending: [...names] }
  }

  // The spinner is already stopped, so pnpm can use the terminal freely.
  await runPnpm(["approve-builds"], { cwd: root, mode: "inherit" })

  const decisions = await readAllowBuilds(root)
  return {
    detected: true,
    reported: [...names],
    ran: true,
    approved: names.filter((name) => decisions[name] === true),
    denied: names.filter((name) => decisions[name] === false),
    pending: names.filter((name) => decisions[name] === undefined),
  }
}

/* -------------------------------------------------------------------------- */
/* Public step                                                                */
/* -------------------------------------------------------------------------- */

export async function installPackagesStep(options: {
  packages: readonly string[]
  rootDir: string
}): Promise<void> {
  const { packages, rootDir } = options
  if (packages.length === 0) return

  const startedAt = Date.now()
  const debug = process.env.NADA_WITH_DEBUG_INFO === "true"

  const workspace = await readWorkspaceContext({ rootDir })

  // Catalogs (and catalogMode) only exist in a workspace.
  const modeResult = workspace.isWorkspace
    ? await resolveCatalogMode(workspace.root)
    : { mode: null, changed: false }

  const [existingCatalogs, contents] = workspace.isWorkspace
    ? await Promise.all([getExistingCatalogs(), readCatalogContents(workspace.root)])
    : [[], {}]

  const choices = await askPackageChoices({
    packages,
    targets: workspace.targets,
    catalogsEnabled: workspace.isWorkspace,
    allowNoCatalog: modeResult.mode === null || modeResult.mode === "manual",
    existingCatalogs,
    contents,
  })

  const results = await runBatches(groupIntoBatches(choices), { root: workspace.root, debug })

  const failed = results.find((result) => result.status === "failed")
  const buildsPending = results.some((result) => result.buildsPending)
  const reportedBuilds = [...new Set(results.flatMap((result) => result.ignoredBuilds))]

  let builds: BuildsReport = {
    detected: buildsPending,
    reported: reportedBuilds,
    ran: false,
    approved: [],
    denied: [],
    pending: reportedBuilds,
  }

  // After a real failure the summary is more useful than another question.
  if (buildsPending && !failed) {
    builds = await offerApproveBuilds(workspace.root, reportedBuilds)
  }

  note(
    formatSummary({
      root: workspace.root,
      isWorkspace: workspace.isWorkspace,
      results,
      choices,
      catalogModeSet: modeResult.changed ? modeResult.mode : null,
      builds,
      elapsedMs: Date.now() - startedAt,
    }),
    "Summary",
  )

  outro(failed ? "Finished with errors." : "Done!")

  if (failed) process.exit(failed.code)
}
