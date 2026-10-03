import {
  isCancel,
  log,
  cancel,
  text,
} from "@clack/prompts"
import os from "node:os"
import process from "node:process"

import {
  createPackageInputState,
  getPackagesFromUserInput,
  parsePackageInput,
  promptUserToProvidePackagesToInstallOrExit,
  showRemarkAboutFlags,
} from "#lib/args.js"
import type { PackageInputState } from "#lib/args.js"
import { ExtendedArray } from "#lib/array.js"
import { EXIT_CODE_GENERAL_FAILURE } from "#lib/constants.js"
import { runPnpmJson } from "#lib/pnpm.js"

// -----------------------------------------------------------------------------
// Text
// -----------------------------------------------------------------------------

const TEXT_TRY_AGAIN_OR_EXIT_QUESTION = [
  "You haven't specified any packages to install.",
  "Would you like to try again or exit?",
].join(os.EOL)

const TEXT_TRY_AGAIN_OPTION = "Try again"
const TEXT_EXIT_OPTION = "Exit"

const TEXT_CORRECTION_REQUEST =
  "Correct the missing packages or add more. Press `Escape` or `Ctrl+C` to continue with the valid packages."

const TEXT_NOTHING_WAS_ENTERED = "Nothing was entered."
const TEXT_NO_VALID_PACKAGES = "No valid packages were provided."

// -----------------------------------------------------------------------------
// Empty-input helper
// -----------------------------------------------------------------------------

/**
 * Kept here as an exported function for compatibility with the previous API.
 *
 * The implementation itself lives in args.ts because this behavior belongs to
 * the package-input flow and is shared by both getPackages() and checkPackages().
 */
export { promptUserToProvidePackagesToInstallOrExit }

// -----------------------------------------------------------------------------
// Registry validation
// -----------------------------------------------------------------------------

/**
 * Checks one exact user-submitted package string against the npm registry.
 *
 * The important distinction is:
 *
 *   input   = exactly what the user typed
 *   version = what the registry resolved that input to
 *
 * The resolved version is useful for display and validation state, but it must
 * NEVER replace the user's original input in the final result.
 */
async function checkPackage(pkg: string) {
  const info = await runPnpmJson({
    command: "info",
    args: [pkg, "version"],
  })

  if (!info) {
    return {
      input: pkg,
      found: false,
      name: undefined,
      version: undefined,
    }
  }

  return {
    input: pkg,
    found: true,
    ...info,
  }
}

// -----------------------------------------------------------------------------
// Formatting
// -----------------------------------------------------------------------------

/**
 * Renders a titled bullet list for clack's log helpers.
 */
function formatList(
  title: string,
  items: Iterable<string>,
) {
  return [
    title,
    ...[...items].map((item) => `- ${item}`),
  ].join(os.EOL)
}

/**
 * Formats validation results for the user.
 *
 * We deliberately separate the typed input from the resolved version here.
 *
 * Example:
 *
 *   react@18 → 18.3.1
 *
 * rather than:
 *
 *   react@18@18.3.1
 */
function formatFoundPackages(
  valid: Map<string, string>,
) {
  return formatList(
    "Found packages",
    [...valid].map(
      ([input, version]) => `${input} → ${version}`,
    ),
  )
}

// -----------------------------------------------------------------------------
// Validation flow
// -----------------------------------------------------------------------------

/**
 * Validates packages against the npm registry.
 *
 * State:
 *
 *   valid
 *     Map keyed by the exact string the user typed.
 *     The value is the resolved registry version.
 *     Because Map keys are unique, a successfully validated entry is never
 *     checked again.
 *
 *   missing
 *     Packages that failed in the MOST RECENT round.
 *     They are used to prefill the correction prompt.
 *
 *   submitted
 *     The package strings submitted for the CURRENT round.
 *
 * Correction behavior:
 *
 *   - packages entered -> new validation round
 *   - empty submission -> warn and keep the same missing packages prefilled
 *   - Escape/Ctrl+C -> continue with whatever is valid
 *
 * The final result is always `valid.keys()`: the exact user-entered strings.
 */
async function checkPackages(options: Readonly<{
  packages: readonly string[]
  packageInputState?: PackageInputState
}>) {
  // This state is intentionally shared with getPackages() by the caller.
  //
  // If checkPackages() is used by itself, it creates an independent state,
  // which is still correct for that standalone flow.
  const packageInputState =
    options.packageInputState ?? createPackageInputState()

  /**
   * Map:
   *
   *   typed input -> resolved version
   *
   * Example:
   *
   *   "react"    -> "19.1.0"
   *   "react@18" -> "18.3.1"
   *
   * This means:
   * - validation state is preserved
   * - exact user input is preserved
   * - already-valid inputs can be skipped
   * - two different inputs such as react and react@18 are both allowed
   */
  const valid = new Map<string, string>()

  /**
   * Only the latest round's missing packages are kept here.
   *
   * If the user removes a missing package from the correction input, it is
   * deliberately no longer considered missing.
   */
  let missing: string[] = []

  /**
   * Deduplicate the initial submission before any registry requests.
   *
   * This guarantees that duplicate input in one round causes at most one
   * request.
   */
  let submitted = ExtendedArray
    .from(options.packages)
    .unique()

  while (true) {
    // -------------------------------------------------------------------------
    // Nothing to check and nothing waiting for correction
    // -------------------------------------------------------------------------

    if (
      submitted.isEmpty() &&
      missing.length === 0
    ) {
      // This path is useful when checkPackages() is called directly with [].
      // There is nothing to validate, so ask the user whether they want to
      // provide packages or leave the flow.
      await promptUserToProvidePackagesToInstallOrExit()

      const fromUser = await getPackagesFromUserInput()

      showRemarkAboutFlags(
        packageInputState,
        fromUser.hasFlagsBeenDetected,
      )

      submitted = fromUser.packages

      continue
    }

    // -------------------------------------------------------------------------
    // Empty correction submission
    // -------------------------------------------------------------------------

    if (submitted.isEmpty()) {
      /**
       * An empty correction input is NOT a new validation round.
       *
       * In particular:
       * - no registry requests are made
       * - `missing` stays intact
       * - the next correction prompt is still prefilled with the same values
       */
      log.warn(TEXT_NOTHING_WAS_ENTERED)
    } else {
      // -----------------------------------------------------------------------
      // New validation round
      // -----------------------------------------------------------------------

      /**
       * Once the user submits a non-empty correction, the previous missing
       * state is replaced by the results of this round.
       *
       * A package that the user did not resubmit is therefore no longer
       * considered "missing"; it has simply been abandoned.
       */
      missing = []

      /**
       * Never check a package that has already validated successfully.
       */
      const toCheck = submitted.filter(
        (pkg) => !valid.has(pkg),
      )

      if (toCheck.isNotEmpty()) {
        log.info(
          "Checking packages on the npm registry...",
        )

        /**
         * All new entries can be checked independently, so run the requests
         * in parallel.
         */
        const results = await Promise.all(
          [...toCheck].map((pkg) => checkPackage(pkg)),
        )

        for (const result of results) {
          if (result.found) {
            /**
             * Keep the exact user input as the Map key.
             *
             * The resolved version is stored separately and is only used for
             * display / remembering successful validation.
             */
            valid.set(
              result.input,
              result.version,
            )
          } else {
            missing.push(result.input)
          }
        }
      }

      // -----------------------------------------------------------------------
      // Show current state
      // -----------------------------------------------------------------------

      if (valid.size > 0) {
        log.success(
          formatFoundPackages(valid),
        )
      }

      /**
       * If every submitted package is valid, we're finished immediately.
       *
       * IMPORTANT:
       * Return the Map keys, NOT the Map values.
       *
       * For example, if the user entered:
       *
       *   react@18
       *
       * and the registry resolved it to 18.3.1, the result must be:
       *
       *   react@18
       *
       * not:
       *
       *   react@18@18.3.1
       */
      if (missing.length === 0) {
        return ExtendedArray.from([
          ...valid.keys(),
        ])
      }

      log.warn(
        formatList(
          "Missing packages",
          missing,
        ),
      )
    }

    // -------------------------------------------------------------------------
    // Correction prompt
    // -------------------------------------------------------------------------

    /**
     * Only reached when there are missing packages.
     *
     * Prefilling with the latest missing list allows the user to fix a typo
     * in place instead of retyping the entire package list.
     */
    const answer = await text({
      message: TEXT_CORRECTION_REQUEST,
      initialValue: missing.join(" "),
    })

    /**
     * Escape and Ctrl+C are both represented as cancellation by clack.
     *
     * At this stage, cancellation means:
     *
     *   "Give up on the missing packages and continue with whatever is valid."
     */
    if (isCancel(answer)) {
      break
    }

    /**
     * Correction input must use the EXACT SAME parser as:
     * - CLI arguments
     * - initial interactive input
     *
     * Therefore flags are filtered here too.
     */
    const parsed = parsePackageInput(
      answer.split(/[\s,]+/v),
    )

    showRemarkAboutFlags(
      packageInputState,
      parsed.hasFlagsBeenDetected,
    )

    /**
     * Whatever the user entered becomes the next round's submission.
     *
     * In particular, a missing package that was omitted is dropped from
     * `missing` on the next non-empty round.
     */
    submitted = parsed.packages
  }

  // ---------------------------------------------------------------------------
  // Escape / Ctrl+C from correction prompt
  // ---------------------------------------------------------------------------

  /**
   * Cancellation is only allowed to continue if something valid exists.
   *
   * Otherwise there is no useful result to hand to the next installation step.
   */
  if (valid.size === 0) {
    cancel(TEXT_NO_VALID_PACKAGES)
    process.exit(EXIT_CODE_GENERAL_FAILURE)
  }

  /**
   * Again, return the exact typed strings, not the resolved versions.
   */
  return ExtendedArray.from([
    ...valid.keys(),
  ])
}

export {
  checkPackages,
  checkPackage,
  formatList,
  formatFoundPackages,
  TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
  TEXT_TRY_AGAIN_OPTION,
  TEXT_EXIT_OPTION,
}
