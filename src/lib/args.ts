#!/usr/bin/env node

import { cancel, note, select, text } from "@clack/prompts"
import os from "node:os"
import process from "node:process"

import { ExtendedArray } from "#lib/array.js"
import { EXIT_CODE_GENERAL_FAILURE } from "#lib/constants.js"
import {
  TEXT_INSTALLATION_PROCESS_TERMINATED_BY_THE_USER,
  unwrap,
} from "#lib/prompts.js"

/**
 * State shared by the whole package-input/validation flow.
 *
 * The flag notice is a piece of UI state, not a parsing state, so it lives here
 * rather than inside parsePackageInput().
 */
type PackageInputState = {
  hasShownFlagRemark: boolean
}

function createPackageInputState(): PackageInputState {
  return {
    hasShownFlagRemark: false,
  }
}

//region ---------------------------------- Text ----------------------------------

const TEXT_REMARK_ABOUT_FLAGS_TITLE = "About flags"

const TEXT_REMARK_ABOUT_FLAGS_CONTENT = [
  "This tool is purely interactive and doesn't need any flags.",
  "Passing them won't do any harm, as they will be completely ignored.",
].join(os.EOL)

const TEXT_INPUT_PACKAGES_REQUEST =
  "Which packages do you want to install? You can enter space- or comma-separated list of names"

const TEXT_TRY_AGAIN_OR_EXIT_QUESTION = [
  "You haven't specified any packages to install.",
  "Would you like to try again or exit?",
].join(os.EOL)

const TEXT_TRY_AGAIN_OPTION = "Try again"
const TEXT_EXIT_OPTION = "Exit"

//endregion ---------------------------------- Text ----------------------------------

/**
 * Parses package input according to the rules of this CLI.
 *
 * A token beginning with "-" is always treated as a flag and discarded.
 * We intentionally do not try to understand individual flag semantics:
 * every flag is ignored, regardless of its name.
 *
 * Example:
 * input: ["react", "--save-dev", "axios", "react"]
 * output: ["react", "axios"]
 */
function parsePackageInput(
  args: readonly string[],
) {
  const hasFlagsBeenDetected = args.some((arg) =>
    arg.startsWith("-"),
  )

  const packages = ExtendedArray
    .from(args)
    .filter((arg) => Boolean(arg) && !arg.startsWith("-"))
    .unique()

  return {
    packages,
    hasFlagsBeenDetected,
  }
}

/**
 * Shows the flag explanation at most once for the current package-input flow.
 */
function showRemarkAboutFlags(
  state: PackageInputState,
  hasFlagsBeenDetected: boolean,
) {
  if (!hasFlagsBeenDetected || state.hasShownFlagRemark) {
    return
  }

  note(
    TEXT_REMARK_ABOUT_FLAGS_CONTENT,
    TEXT_REMARK_ABOUT_FLAGS_TITLE,
  )

  state.hasShownFlagRemark = true
}

/**
 * Reads packages supplied after the command itself.
 *
 * pnpm invokes this CLI with: node <script> <package> <package> ...
 * so the first two argv entries belong to the launcher and are removed before
 * package parsing. This is preferable to filtering the whole argv array first:
 * parsePackageInput() should know nothing about process.argv's structure.
 */
function getPackagesFromCliArgs() {
  const COMMAND_PLUS_SCRIPT_ARGS_LENGTH = 2

  return parsePackageInput(
    process.argv.slice(COMMAND_PLUS_SCRIPT_ARGS_LENGTH),
  )
}

/**
 * Prompts the user for packages and parses the answer using the exact same
 * parser used by CLI arguments and correction input.
 *
 * Escape/Ctrl+C is treated as an empty submission here. The caller decides
 * what an empty submission means in the current stage of the flow.
 */
async function getPackagesFromUserInput() {
  const input = await text({
    message: TEXT_INPUT_PACKAGES_REQUEST,
    placeholder: "react react-router",
  })

  // @clack/prompts return a cancel symbol for Escape/Ctrl+C.
  // For the initial package prompt, cancellation has the same meaning as
  // submitting nothing: show the Try again / Exit choice.
  if (typeof input !== "string") {
    return {
      packages: ExtendedArray.from<string>([]),
      hasFlagsBeenDetected: false,
    }
  }

  const args = input.split(/[\s,]+/v)

  return parsePackageInput(args)
}

// -----------------------------------------------------------------------------
// Empty-input helper
// -----------------------------------------------------------------------------

/**
 * Handles the "no packages were entered" decision.
 *
 * This helper is shared by getPackages() and checkPackages(), so the same
 * behavior applies whether the absence of packages happens before validation
 * or after a later empty submission.
 */
async function promptUserToProvidePackagesToInstallOrExit() {
  const choice = unwrap(
    await select({
      message: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      options: [
        { value: TEXT_TRY_AGAIN_OPTION },
        { value: TEXT_EXIT_OPTION },
      ],
    }),
  )

  if (choice === TEXT_EXIT_OPTION) {
    // unwrap() handles cancellation of the select itself.
    cancel(TEXT_INSTALLATION_PROCESS_TERMINATED_BY_THE_USER)
    process.exit(EXIT_CODE_GENERAL_FAILURE)
  }
}

// -----------------------------------------------------------------------------
// Main package-input flow
// -----------------------------------------------------------------------------

/**
 * Gets the initial package list.
 *
 * Priority:
 *
 *   1. Packages supplied after the CLI command.
 *   2. Interactive input.
 *
 * Empty interactive input does not fail. The user is asked whether they want
 * to try again or exit.
 *
 * `state` is shared with checkPackages() so the flag notice can genuinely be
 * shown only once during the entire package-input/validation flow.
 */
async function getPackages(
  state: PackageInputState = createPackageInputState(),
) {
  const fromCli = getPackagesFromCliArgs()

  showRemarkAboutFlags(
    state,
    fromCli.hasFlagsBeenDetected,
  )

  // `pnpm nada lodash axios react`
  // returns the package arguments directly without showing another prompt.
  if (fromCli.packages.isNotEmpty()) {
    return fromCli.packages
  }

  while (true) {
    const fromUser = await getPackagesFromUserInput()

    showRemarkAboutFlags(
      state,
      fromUser.hasFlagsBeenDetected,
    )

    if (fromUser.packages.isNotEmpty()) {
      return fromUser.packages
    }

    // Nothing was provided (or the prompt was cancelled), so let the user
    // explicitly choose between trying again and exiting.
    await promptUserToProvidePackagesToInstallOrExit()
  }
}

export {
  getPackages,
  getPackagesFromCliArgs,
  getPackagesFromUserInput,
  parsePackageInput,
  promptUserToProvidePackagesToInstallOrExit,
  showRemarkAboutFlags,
  createPackageInputState,
  TEXT_REMARK_ABOUT_FLAGS_CONTENT,
  TEXT_REMARK_ABOUT_FLAGS_TITLE,
  TEXT_INPUT_PACKAGES_REQUEST,
  TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
  TEXT_TRY_AGAIN_OPTION,
  TEXT_EXIT_OPTION,
}

export type {
  PackageInputState,
}
