#!/usr/bin/env node

import { cancel, note, select, text } from "@clack/prompts"
import os from "node:os"
import process from "node:process"

import type { NotificationsState } from "#lib/state.js"

import { ExtendedArray } from "#lib/array.js"
import {EXIT_CODE_GENERAL_FAILURE, SPLIT_BY_SPACES_AND_COMAS_REGEX} from "#lib/constants.js"
import { TEXT_INSTALLATION_PROCESS_TERMINATED_BY_THE_USER, unwrap } from "#lib/prompts.js"

//region ---------------------------------- Text ----------------------------------

const TEXT_NOTE_ABOUT_FLAGS_TITLE = "About flags"
const TEXT_NOTE_ABOUT_FLAGS_CONTENT = [
  "This tool is purely interactive and doesn't need any flags.",
  "Passing them won't do any harm, as they will be completely ignored.",
].join(os.EOL)

const TEXT_NOTE_ABOUT_DUPLICATES_TITLE = "About duplicates"
const TEXT_NOTE_ABOUT_DUPLICATES_CONTENT = [
  "Some the packages were detected as duplicates and were filtered out.",
  "Packages with the same name are considered duplicates,",
  "even if they have different versions",
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

type PackageNameToVersionMap = Map<string, string | undefined>

/**
 * Filters out packages with the same name, but
 * different version. That's an edge case, so in order not to overcomplicate
 * the logic, we're just following first-in-fisrt-out principle. In other words,
 * packages in the beginning of the line will be kept and their older (or anger) siblings
 * will be eliminated.
 */
function dedupe(packages: readonly string[]) {
  const nameToVersionMap: PackageNameToVersionMap = new Map()
  /**
   * Handles react, react@18, react@^18.0.0, react@~18.0.0.
   * Example:
   *  - input: react@~18.0.0
   *  - output: ["react", "18.0.0"]
   */
  const NAME_VERSION_SPLITTER_REGEX = /@[~^]*/v
  for (const pkg in packages) {
    const [name, version] = pkg.split(NAME_VERSION_SPLITTER_REGEX)
    if (typeof name === "string" && name) {
      if (!nameToVersionMap.has(name)) {
        nameToVersionMap.set(name, version ?? undefined)
      }
    }
  }

  const hasDetectedDuplicates = nameToVersionMap.size !== packages.length
  return {
    packages: nameToVersionMap,
    hasDetectedDuplicates,
  }
}

/**
 * Cleans up packages list, filtering out additional, non-relevant
 * arguments, like flags (--save-dev, --filter, etc.), duplicates
 * (including same packages with different versions) and
 * falsy values.
 *
 * A token beginning with "-" is always treated as a flag and discarded.
 * We intentionally do not try to understand individual flag semantics:
 * every flag is ignored, regardless of its name.
 *
 * Example:
 * input: ["react", "--save-dev", "axios", "react", ""]
 * output: ["react", "axios"]
 */
function cleanUpPackagesList(args: readonly string[]) {
  const hasDetectedFlags = args.some((arg) => arg.startsWith("-"))

  const packages = ExtendedArray.from(args)
    .filter((arg) => Boolean(arg) && !arg.startsWith("-"))
    .unique()

  return {
    ...dedupe(packages),
    hasDetectedFlags,
  }
}

/**
 * Shows the note about flags
 * at most once for the current session.
 */
function showNoteAboutFlags({
  state,
  hasDetectedFlags,
}: {
  state: NotificationsState
  hasDetectedFlags: boolean
}) {
  if (!hasDetectedFlags || state.hasAlreadyShownNoteAboutFlags) {
    return
  }

  note(TEXT_NOTE_ABOUT_FLAGS_CONTENT, TEXT_NOTE_ABOUT_FLAGS_TITLE)

  state.hasAlreadyShownNoteAboutFlags = true
}

/**
 * Shows the note about duplicated packages
 * at most once for the current session.
 */
function showNoteAboutDuplicates({
  state,
  hasDetectedDuplicates,
}: {
  state: NotificationsState
  hasDetectedDuplicates: boolean
}) {
  if (!hasDetectedDuplicates || state.hasAlreadyShownNoteAboutDuplicates) {
    return
  }

  note(TEXT_NOTE_ABOUT_DUPLICATES_CONTENT, TEXT_NOTE_ABOUT_DUPLICATES_TITLE)

  state.hasAlreadyShownNoteAboutDuplicates = true
}

/**
 * Reads packages supplied after the command itself.
 *
 * pnpm invokes this CLI with: node <script> <package> <package> ...
 * so the first two argv entries belong to the launcher and the executable
 * and are removed before cleaning up the list. This is preferable to filtering the whole argv array first:
 * parsePackageInput() should know nothing about process.argv's structure.
 */
function getPackagesFromCliArgs() {
  const COMMAND_PLUS_SCRIPT_ARGS_LENGTH = 2

  return cleanUpPackagesList(process.argv.slice(COMMAND_PLUS_SCRIPT_ARGS_LENGTH))
}

/**
 * Prompts the user for packages and parses the answer using the exact same
 * parser used by CLI arguments and correction input.
 *
 * Escape/Ctrl+C is treated as an empty submission here. The caller decides
 * what an empty submission means in the current stage of the flow.
 */
async function getPackagesFromUserInput(): Promise<{
  packages: PackageNameToVersionMap
  hasDetectedFlags: boolean
  hasDetectedDuplicates: boolean
}> {
  const input = await text({
    message: TEXT_INPUT_PACKAGES_REQUEST,
    placeholder: "react react-router",
  })

  /**
   * @clack/prompts return a cancel symbol for Escape/Ctrl+C.
   * For the initial package prompt, cancellation has the same meaning as
   * submitting nothing: user is offered "Try again / Exit" choice.
   */
  if (typeof input !== "string") {
    return {
      packages: new Map(),
      hasDetectedFlags: false,
      hasDetectedDuplicates: false,
    }
  }

  const args = input.split(SPLIT_BY_SPACES_AND_COMAS_REGEX)

  return cleanUpPackagesList(args)
}

/**
 * Handles the "no packages were entered" decision.
 *
 * This helper is shared by getPackages() and checkPackages(), so the same
 * behavior applies whether the absence of packages happens before validation
 * or after the submission.
 */
async function promptUserToProvidePackagesToInstallOrExit() {
  const choice = unwrap(
    await select({
      message: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      options: [{ value: TEXT_TRY_AGAIN_OPTION }, { value: TEXT_EXIT_OPTION }],
    }),
  )

  if (choice === TEXT_EXIT_OPTION) {
    cancel(TEXT_INSTALLATION_PROCESS_TERMINATED_BY_THE_USER)
    process.exit(EXIT_CODE_GENERAL_FAILURE)
  }
}

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
async function getPackages({ state }: { state: NotificationsState }) {
  {
    const { packages, hasDetectedFlags, hasDetectedDuplicates } = getPackagesFromCliArgs()
    showNoteAboutFlags({ state, hasDetectedFlags })
    showNoteAboutDuplicates({ state, hasDetectedDuplicates })
    if (packages.size > 0) {
      return packages
    }
  }

  while (true) {
    const { packages, hasDetectedFlags, hasDetectedDuplicates } = await getPackagesFromUserInput()
    showNoteAboutFlags({ state, hasDetectedFlags })
    showNoteAboutDuplicates({ state, hasDetectedDuplicates })
    if (packages.size > 0) return packages
    await promptUserToProvidePackagesToInstallOrExit()
  }
}

export {
  getPackages,
  getPackagesFromCliArgs,
  getPackagesFromUserInput,
  cleanUpPackagesList,
  promptUserToProvidePackagesToInstallOrExit,
  showNoteAboutFlags,
  showNoteAboutDuplicates,
  TEXT_NOTE_ABOUT_FLAGS_CONTENT,
  TEXT_NOTE_ABOUT_FLAGS_TITLE,
  TEXT_INPUT_PACKAGES_REQUEST,
  TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
  TEXT_TRY_AGAIN_OPTION,
  TEXT_EXIT_OPTION,
}

export type { PackageNameToVersionMap }
