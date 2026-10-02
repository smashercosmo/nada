#!/usr/bin/env node
import { intro, log, cancel, updateSettings } from "@clack/prompts"
import console from "node:console"
import process from "node:process"

import { EXIT_CODE_CANCELLED, EXIT_CODE_FATAL_EXCEPTION, TEXT_INTRO } from "#lib/utils/constants.js"
import { installPackagesStep } from "#lib/utils/install.js"
import {
  getPackagesFromUserInputStep,
  getPackagesFromCliArgsStep,
  checkPackages,
} from "#lib/utils/steps.js"
import { ExtendedArray } from "#lib/utils/array.js"
import { findWorkspaceDir } from "@pnpm/find-workspace-dir"

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NADA_DISABLE_GUIDE_LINES?: "true" | "false"
      NADA_WITH_DEBUG_INFO?: "true" | "false"
      NADA_CWD?: string
    }
  }
}

async function main() {
  const rootDir = await findWorkspaceDir(process.cwd())

  if (!rootDir) {
    log.error("Could not find root workspace directory.")
    cancel("Installation failed.")
    process.exit(EXIT_CODE_FATAL_EXCEPTION)
  }

  /**
   * Disabling guidelines makes testing easier, as
   * string comparison is more straightforward.
   */
  if (process.env.NADA_DISABLE_GUIDE_LINES === "true") {
    updateSettings({ withGuide: false })
  }

  intro(TEXT_INTRO)

  // await checkIfPnpmIsAvailableStep()
  // await checkIfPnpmVersionIsSupportedStep()

  const packagesFromCliArgs = getPackagesFromCliArgsStep()

  const packagesFromUserInput = packagesFromCliArgs.isEmpty()
    ? await getPackagesFromUserInputStep()
    : ExtendedArray.from([])

  const packages = packagesFromCliArgs.concat(packagesFromUserInput)

  const validPackages = await checkPackages({ packages })

  await installPackagesStep({
    packages: validPackages,
    rootDir,
  })
}

/**
 * The previous `try { void (async () => await main())() } catch {}` could never
 * catch anything: the promise was voided inside the try block, so rejections
 * went unhandled. `.catch()` on the promise actually handles them.
 */
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Something went wrong :(")
  process.exit(EXIT_CODE_FATAL_EXCEPTION)
})
