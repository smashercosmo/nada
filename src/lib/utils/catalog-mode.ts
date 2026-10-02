import { log, select } from "@clack/prompts"

import { runPnpmJson } from "#lib/utils/pnpm.js"
import { runPnpm, tailLines } from "#lib/utils/pnpm-process.js"
import { unwrap } from "#lib/utils/prompts.js"

export type CatalogMode = "manual" | "prefer" | "strict"

export interface CatalogModeResult {
  /** `null` means the setting isn't configured in the workspace. */
  mode: CatalogMode | null
  /** True if this run saved the mode to the workspace settings. */
  changed: boolean
}

function isCatalogMode(value: unknown): value is CatalogMode {
  return value === "manual" || value === "prefer" || value === "strict"
}

/** `pnpm config get catalogMode --json` prints `null` when the setting isn't set. */
export async function readCatalogMode(cwd: string): Promise<CatalogMode | null> {
  try {
    const value: unknown = await runPnpmJson({ command: "config", args: ["get", "catalogMode"], cwd })
    return isCatalogMode(value) ? value : null
  } catch {
    return null
  }
}

async function saveCatalogMode(cwd: string, mode: CatalogMode): Promise<void> {
  // Always the project location: only the workspace's own settings are touched.
  const result = await runPnpm(["config", "set", "catalogMode", mode, "--location=project"], {
    cwd,
    mode: "capture",
  })

  if (result.code !== 0) {
    throw new Error(
      `pnpm config set exited with ${result.code}:\n${tailLines(result.output).join("\n")}`,
    )
  }

  const saved = await readCatalogMode(cwd)
  if (saved !== mode) {
    throw new Error(
      `catalogMode was not saved to the workspace settings (found: ${saved ?? "unset"}).`,
    )
  }
}

/**
 * Only an unset `catalogMode` triggers the explanation and the prompt; an
 * explicit value (even `manual`) counts as a decision. Choosing "Skip for now"
 * saves nothing, so this runs again next time.
 */
export async function resolveCatalogMode(cwd: string): Promise<CatalogModeResult> {
  const current = await readCatalogMode(cwd)
  if (current !== null) return { mode: current, changed: false }

  log.info(
    [
      `If you do not want to see the "No catalog" option, set the "catalogMode" setting to "strict" (recommended) or "prefer".`,
      `"strict" only accepts dependency versions that satisfy the catalog.`,
    ].join("\n"),
  )

  const choice = unwrap(
    await select<CatalogMode | "skip">({
      message: "Do you want to set catalogMode now?",
      options: [
        { value: "strict", label: "strict (recommended)", hint: "only versions that satisfy the catalog" },
        { value: "prefer", label: "prefer", hint: "catalog versions first, direct dependencies as a fallback" },
        { value: "manual", label: "manual", hint: "pnpm's default" },
        { value: "skip", label: "Skip for now" },
      ],
    }),
  )

  if (choice === "skip") return { mode: null, changed: false }

  try {
    await saveCatalogMode(cwd, choice)
    log.success(`catalogMode set to "${choice}".`)
    return { mode: choice, changed: true }
  } catch (error) {
    log.error(error instanceof Error ? error.message : "Could not set catalogMode.")
    return { mode: null, changed: false }
  }
}
