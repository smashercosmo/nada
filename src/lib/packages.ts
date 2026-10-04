import { isCancel, log, cancel, text } from "@clack/prompts"
import os from "node:os"
import process from "node:process"

import type { NotificationsState } from "#lib/state.js"

import {
  getPackagesFromUserInput,
  cleanUpPackagesList,
  promptUserToProvidePackagesToInstallOrExit,
  showNoteAboutFlags,
  showNoteAboutDuplicates,
  type PackageNameToVersionMap,
} from "#lib/args.js"
import { ExtendedArray } from "#lib/array.js"
import {EXIT_CODE_GENERAL_FAILURE, SPLIT_BY_SPACES_AND_COMAS_REGEX} from "#lib/constants.js"
import { runPnpmJson } from "#lib/pnpm.js"

const TEXT_CORRECTION_REQUEST =
  "Correct the missing packages or add more. Press `Escape` or `Ctrl+C` to continue with the valid packages."

const TEXT_ORIGINAL_INPUT_HAS_NOT_BEEN_CHANGED = "Original input has not been changed."
const TEXT_NO_VALID_PACKAGES_PROVIDED = "No valid packages were provided."

function formatPackage({ name, version }: { name: string; version?: string | undefined }) {
  return version ? `${name}@${version}` : name
}

/**
 * Checks one exact user-submitted package against the npm registry.
 * No matter the user's original input, version, found in the registry will
 * be the one installed.
 *
 * Example:
 *  - User typed react@18
 *  - Pnpm found react@18.3.1
 *  - 18.3.1 is going to be installed
 */
async function checkPackage({ name, version }: { name: string; version?: string | undefined }) {
  const pkg = formatPackage({ name, version })
  const info = await runPnpmJson({
    command: "info",
    args: [pkg, "version"],
  })

  if (info) {
    return {
      input: pkg,
      found: true,
      ...info,
    } as const
  }

  return {
    input: pkg,
    found: false,
    name: undefined,
    version: undefined,
  } as const
}

/**
 * Renders a titled bullet list for clack's log helpers.
 */
function formatList(title: string, items: Iterable<string>) {
  return [title, ...[...items].map((item) => `- ${item}`)].join(os.EOL)
}

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
async function checkPackages({
  state,
  packages,
}: Readonly<{
  packages: PackageNameToVersionMap
  state: NotificationsState
}>) {
  const valid: PackageNameToVersionMap = new Map()

  /**
   * Only the latest round's missing packages are kept here.
   *
   * If the user removes a missing package from the correction input, it is
   * deliberately no longer considered missing.
   */
  let missing: string[] = []

  let submitted = new Map(packages)

  while (true) {
    /**
     * Nothing to check and nothing waiting for correction.
     * In that case just asking user if they want to try again
     * and add some input in a form of packages list.
     */
    if (submitted.size === 0 && missing.length === 0) {
      await promptUserToProvidePackagesToInstallOrExit()
      const { packages, hasDetectedFlags, hasDetectedDuplicates } = await getPackagesFromUserInput()
      showNoteAboutFlags({ state, hasDetectedFlags })
      showNoteAboutDuplicates({ state, hasDetectedDuplicates })
      submitted = packages
      continue
    }

    if (submitted.size === 0) {
      /**
       * An empty correction input is NOT a new validation round.
       * The next correction prompt is still prefilled with the same values.
       */
      log.warn(TEXT_ORIGINAL_INPUT_HAS_NOT_BEEN_CHANGED)
    } else {
      /**
       * Once the user submits a non-empty correction, the previous missing
       * state is replaced by the results of this round.
       *
       * A package that the user did not resubmit is therefore no longer
       * considered "missing"; it has simply been abandoned.
       */
      missing = []

      const packagesToCheck = new Map(submitted)

      /**
       * Never check a package that has been already validated successfully.
       */
      for (const name of valid.keys()) {
        if (packagesToCheck.has(name)) {
          packagesToCheck.delete(name)
        }
      }

      if (packagesToCheck.size > 0) {
        log.info("Checking packages on the npm registry...")

        /**
         * All new entries can be checked independently, so run the requests
         * in parallel.
         */
        const results = await Promise.all(
          [...packagesToCheck].map(([name, version]) => checkPackage({ name, version })),
        )

        for (const result of results) {
          if (result.found) {
            /**
             * Keep the exact user input as the Map key.
             *
             * The resolved version is stored separately and is only used for
             * display / remembering successful validation.
             */
            valid.set(result.name, result.version)
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
          formatList(
            "Found packages",
            [...valid].map(([input, version]) => `${input} → ${version}`),
          ),
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
        return ExtendedArray.from([...valid.keys()])
      }

      log.warn(formatList("Missing packages", missing))
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
     * Therefore, flags are filtered here too.
     */
    const { packages, hasDetectedFlags, hasDetectedDuplicates } = cleanUpPackagesList(answer.split(SPLIT_BY_SPACES_AND_COMAS_REGEX))
    showNoteAboutFlags({state, hasDetectedFlags })
    showNoteAboutDuplicates({state, hasDetectedDuplicates })

    /**
     * Whatever the user entered becomes the next round's submission.
     *
     * In particular, a missing package that was omitted is dropped from
     * `missing` on the next non-empty round.
     */
    submitted = new Map(packages)
  }

  // ---------------------------------------------------------------------------
  // Escape / Ctrl+C from correction prompt
  // ---------------------------------------------------------------------------

  /**
   * Cancellation is only allowed to continue if something valid exists.
   *
   * Otherwise, there is no useful result to hand to the next installation step.
   */
  if (valid.size === 0) {
    cancel(TEXT_NO_VALID_PACKAGES_PROVIDED)
    process.exit(EXIT_CODE_GENERAL_FAILURE)
  }

  /**
   * Again, return the exact typed strings, not the resolved versions.
   */
  return ExtendedArray.from([...valid.keys()])
}

export { checkPackages, checkPackage, formatList, promptUserToProvidePackagesToInstallOrExit }
