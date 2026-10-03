#!/usr/bin/env node
import { intro, log, cancel, updateSettings } from "@clack/prompts"
import { findWorkspaceDir } from "@pnpm/find-workspace-dir"
import console from "node:console"
import process from "node:process"

import { getPackagesFromCliArgs } from "#lib/utils/args.js"
import { ExtendedArray } from "#lib/utils/array.js"
import { EXIT_CODE_FATAL_EXCEPTION, TEXT_INTRO } from "#lib/utils/constants.js"
import { installPackagesStep } from "#lib/utils/install.js"
import { getPackagesFromUserInput, checkPackages } from "#lib/utils/packages.js"

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NADA_DISABLE_GUIDE_LINES?: "true" | "false"
      NADA_REPORTER?: "default" | "verbose"
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

  /**
   *  1. Intro
   */
  intro(TEXT_INTRO)

  /**
   *  2. Collecting packages to install
   */

  /**
   *  2.1. First, checking if packages were provided as cli args
   *
   *  Example: `nada lodash axios`
   */
  const packagesFromCliArgs = getPackagesFromCliArgs()

  /**
   *  2.2. Then, if CLI was called with no args, let the user enter packages in the text field
   */
  const packagesFromUserInput = packagesFromCliArgs.isEmpty()
    ? await getPackagesFromUserInput()
    : ExtendedArray.from([])

  const packages = packagesFromCliArgs.concat(packagesFromUserInput)

  /**
   * 3.
   */
  const validPackages = await checkPackages({ packages })

  await installPackagesStep({
    packages: validPackages,
    rootDir,
  })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Something went wrong")
  process.exit(EXIT_CODE_FATAL_EXCEPTION)
})
