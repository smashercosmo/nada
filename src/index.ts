#!/usr/bin/env node

import {
  intro,
  log,
  cancel,
  updateSettings,
  settings,
} from "@clack/prompts"
import { findWorkspaceDir } from "@pnpm/find-workspace-dir"
import console from "node:console"
import process from "node:process"

import {
  createPackageInputState,
  getPackages,
} from "#lib/args.js"
import { EXIT_CODE_GENERAL_FAILURE, TEXT_INTRO } from "#lib/constants.js"
import { installPackagesStep } from "#lib/install.js"
import { checkPackages } from "#lib/packages.js"

async function main() {
  const rootDir = await findWorkspaceDir(
    process.cwd(),
  )

  if (!rootDir) {
    log.error(
      "Could not find root workspace directory.",
    )

    cancel("Installation failed.")
    process.exit(EXIT_CODE_GENERAL_FAILURE)
  }

  /**
   * Disabling guide lines makes testing easier because string comparison is
   * more straightforward.
   */
  if (
    process.env.NADA_DISABLE_GUIDE_LINES === "true"
  ) {
    updateSettings({ withGuide: false })
  }

  /*const defaultAliases = new Map(settings.aliases)
  updateSettings({ aliases:  })*/
  intro(TEXT_INTRO)

  /**
   * This state is shared by the entire package-input + validation flow.
   *
   * That means:
   *
   *   CLI flags
   *      ↓
   *   initial prompt flags
   *      ↓
   *   correction prompt flags
   *
   * all participate in the same "show About flags once" rule.
   */
  const packageInputState =
    createPackageInputState()

  const packages = await getPackages(
    packageInputState,
  )

  const validPackages = await checkPackages({
    packages,
    packageInputState,
  })

  // Installation step
  await installPackagesStep({
    packages: validPackages,
    rootDir,
  })
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Something went wrong",
  )

  process.exit(
    EXIT_CODE_GENERAL_FAILURE,
  )
})
