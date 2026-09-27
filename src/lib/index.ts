#!/usr/bin/env node
import { intro, updateSettings } from "@clack/prompts"
import console from "node:console"
import process from "node:process"

import { EXIT_CODE_FATAL_EXCEPTION, TEXT_INTRO } from "#lib/utils/constants.js"
import {
  checkIfPnpmVersionIsSupportedStep,
  checkIfPnpmIsAvailableStep,
  getPackagesFromUserInputStep,
  getPackagesFromCliArgsStep,
} from "#lib/utils/steps.js"

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
  /**
   * Disabling guidelines makes testing easier, as
   * string comparison is more straightforward.
   */
  if (process.env.NADA_DISABLE_GUIDE_LINES === "true") {
    updateSettings({ withGuide: false })
  }

  intro(TEXT_INTRO)

  await checkIfPnpmIsAvailableStep()
  await checkIfPnpmVersionIsSupportedStep()

  const packagesFromCliArgs = getPackagesFromCliArgsStep()
  const isPackagesFromCliArgsArrayEmpty = packagesFromCliArgs.isEmpty()

  console.log(packagesFromCliArgs)

  if (isPackagesFromCliArgsArrayEmpty) {
    const packagesFromUserInput = await getPackagesFromUserInputStep()
    const packages = [...packagesFromCliArgs, ...packagesFromUserInput]
    console.log(packages)
  }

  // Await checkPackages({ packages })

  // Rest of the code...

  // Process.exit(EXIT_CODE_NO_MORE_CODE_TO_EXECUTE)
}

try {
  // oxlint-disable-next-line unicorn/prefer-top-level-await -- top-level `await` prevents modules from being loaded with `require(esm)`.
  void (async () => {
    await main()
  })()
} catch (error) {
  console.error(error instanceof Error ? error.message : "Something went wrong :(")
  process.exit(EXIT_CODE_FATAL_EXCEPTION)
}
