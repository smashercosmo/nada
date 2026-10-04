#!/usr/bin/env node

// Add this at the very top of your CLI entry file (e.g., cli.ts),
// or in your test-setup file so it overrides stdout before Clack loads.

if (process.env.NODE_ENV === 'test') {
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = function (
    chunk: string | Uint8Array,
    ...args: any[]
  ): boolean {
    if (typeof chunk === 'string') {
      // 1. Strip ANSI escape codes (colors, cursor hide/show)
      let cleaned = chunk.replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '');

      // 2. Strip Clack UI characters (Boxes, Diamonds ◆, Checks ✔, Crosses ✖)
      cleaned = cleaned.replace(/[\u2500-\u25FF\u2600-\u26FF\u2700-\u27BF\u2139]/g, '');

      // 3. Fix layout: Collapse the empty padding left by removed box lines
      const hasTrailingNewline = cleaned.endsWith('\n');

      cleaned = cleaned
      .split('\n')
      .map((line) => line.trim())      // Remove left/right padding spaces
      .filter((line) => line.length > 0) // Drop completely empty UI lines
      .join('\n');

      // Restore the newline if it existed, so the test runner frames it correctly
      if (hasTrailingNewline && cleaned.length > 0) {
        cleaned += '\n';
      }

      // If the chunk was entirely UI shapes/padding, swallow it completely
      if (!cleaned) {
        return true;
      }

      return originalWrite(cleaned, ...args);
    }

    // Pass Buffer/Uint8Array chunks through untouched
    return originalWrite(chunk, ...args);
  } as typeof process.stdout.write;
}

import { intro, log, cancel, updateSettings } from "@clack/prompts"
import console from "node:console"
import path from "node:path"
import process from "node:process"
import url from "node:url"

import { getPackages } from "#lib/args.js"
import { EXIT_CODE_GENERAL_FAILURE, TEXT_INTRO } from "#lib/constants.js"
import { installPackagesStep } from "#lib/install.js"
import { checkPackages } from "#lib/packages.js"
import { createNotificationsState } from "#lib/state.js"
import { findProjectRoot } from "#lib/utils.js"

const __dirname: string = path.dirname(url.fileURLToPath(import.meta.url))

async function main() {
  const rootDir = findProjectRoot(__dirname)

  if (!rootDir) {
    log.error("Could not find root workspace directory.")

    cancel("Installation failed.")
    process.exit(EXIT_CODE_GENERAL_FAILURE)
  }

  /**
   * Disabling guide lines makes testing easier because string comparison is
   * more straightforward.
   */
  if (process.env.NADA_DISABLE_GUIDE_LINES === "true") {
    updateSettings({ withGuide: false })
  }

  intro(TEXT_INTRO)

  const state = createNotificationsState()

  /**
   * 1. Packages list collection step
   */
  const packages = await getPackages({ state })

  /**
   * 2. Packages validation step
   */
  const validPackages = await checkPackages({
    packages,
    state,
  })

  /**
   * 3. Packages installation step
   */
  await installPackagesStep({
    packages: validPackages,
    rootDir,
  })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Something went wrong")

  process.exit(EXIT_CODE_GENERAL_FAILURE)
})
