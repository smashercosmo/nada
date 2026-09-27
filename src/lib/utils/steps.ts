import { log, cancel, text, select } from "@clack/prompts"
import os from "node:os"
import process from "node:process"

import { filterOutFlags } from "#lib/utils/args.js"
import {
  EXIT_CODE_FATAL_EXCEPTION,
  getPnpmVersionIsNotSupportedMessage,
  PACKAGE_MANAGER_IS_NOT_SUPPORTED_TEXT,
  SUPPORTED_PACKAGE_MANAGER,
  TEXT_CHECKING_IF_PNPM_IS_AVAILABLE,
  TEXT_CHECKING_IF_PNPM_VERSION_IS_SUPPORTED,
  TEXT_COULD_NOT_DETERMINE_CURRENT_PNPM_VERSION,
  TEXT_COULD_NOT_DETERMINE_SUPPORTED_PNPM_VERSION,
  TEXT_EXITING,
  TEXT_PNPM_CHECK_ERROR,
  TEXT_PNPM_CHECK_SUCCESS,
} from "#lib/utils/constants.js"
import { checkIfPnpmIsAvailable, getCurrentPnpmVersion } from "#lib/utils/pnpm.js"
import packageJson from "#root/package.json" with { type: "json" }

const VERSION_REGEX = /^[<=>^~]*(?<major>\d+)\.\d+\.\d+$/v

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NADA_DISABLE_GUIDE_LINES?: "true" | "false"
    }
  }
}

/**
 * Step 1
 */
async function checkIfPnpmIsAvailableStep() {
  log.info(TEXT_CHECKING_IF_PNPM_IS_AVAILABLE)
  const isPnpmAvailable = await checkIfPnpmIsAvailable()

  if (isPnpmAvailable) {
    log.success(TEXT_PNPM_CHECK_SUCCESS)
  } else {
    log.error(TEXT_PNPM_CHECK_ERROR)
    cancel(TEXT_EXITING)
    process.exit(EXIT_CODE_FATAL_EXCEPTION)
  }
}

function extractMajorVersion(version?: string) {
  if (version === undefined) {
    return 0
  } else {
    const major = VERSION_REGEX.exec(version)?.groups?.["major"]
    return Number(major) || 0
  }
}

/**
 * Step 1
 */
async function checkIfPnpmVersionIsSupportedStep() {
  log.info(TEXT_CHECKING_IF_PNPM_VERSION_IS_SUPPORTED)
  const [currentPnpmVersion, getCurrentPnpmVersionError] = await getCurrentPnpmVersion()

  if (getCurrentPnpmVersionError instanceof Error) {
    cancel(PACKAGE_MANAGER_IS_NOT_SUPPORTED_TEXT)
    process.exit(EXIT_CODE_FATAL_EXCEPTION)
  }

  const supportedPnpmVersion = packageJson.engines.pnpm
  const currentPnpmMajorVersion = extractMajorVersion(currentPnpmVersion)
  const supportedPnpmMajorVersion = extractMajorVersion(supportedPnpmVersion)

  if (supportedPnpmVersion === undefined) {
    log.warn(TEXT_COULD_NOT_DETERMINE_SUPPORTED_PNPM_VERSION)
  } else if (currentPnpmVersion === undefined) {
    log.warn(TEXT_COULD_NOT_DETERMINE_CURRENT_PNPM_VERSION)
  } else {
    if (currentPnpmMajorVersion < supportedPnpmMajorVersion) {
      log.warn(
        getPnpmVersionIsNotSupportedMessage({
          supportedPnpmMajorVersion: String(supportedPnpmMajorVersion),
          currentPnpmVersion,
        }),
      )
    }
  }
}

/**
 * Step 3
 */
function getPackagesFromCliArgsStep() {
  const BASE_ARGS_LENGTH = [SUPPORTED_PACKAGE_MANAGER, packageJson.name].length
  return filterOutFlags(process.argv.slice(BASE_ARGS_LENGTH))
}

/**
 * Step 4
 */
async function getPackagesFromUserInputStep() {
  const result = await text({
    message:
      "Which packages you want to install? You can enter space- or comma-separated list of names",
    placeholder: "react react-router",
  })

  const packages = filterOutFlags(typeof result === "string" ? result.split(/\s+/v) : [])

  if (packages.isEmpty()) {
    const choice = await select({
      message: [
        "You haven't specified any packages to install.",
        "Would you like yo try again or exit?",
      ].join(os.EOL),
      options: [{ value: "Try again" }, { value: "Exit" }],
    })

    if (choice === "Exit") {
      cancel("Good bye, See you,")
      process.exit(1)
    }

    if (choice === "Try again") {
      return getPackagesFromUserInputStep()
    }
  }

  return packages
}

/*type PackageCheckResult =
  | {
  input: string
  found: true
  name: string
}
  | {
  input: string
  found: false
}*/

/**
 * Checks one package against the npm registry.
 *
 * Errors are converted into a `found: false` result rather than being thrown.
 * This is important because one failed registry request must not prevent the
 * remaining packages from being checked.
 */
/*async function checkPackage(pkg: string): Promise<PackageCheckResult> {
  const [info, error] = await getPackageInfo(pkg)

  if (error) {
    if (process.env.NADA_WITH_DEBUG_INFO === "true") {
      console.error(error.message)
    }
    return {
      input: pkg,
      found: false,
    }
  }

  const lines = info.split(os.EOL)
  const name = lines[0]?.split(/\s+/v)[0]

  if (name === undefined || name === "") {
    return {
      input: pkg,
      found: false,
    }
  }

  return {
    input: pkg,
    found: true,
    name,
  }
}*/

/**
 * Recursively validates packages against the npm registry.
 *
 * `found` contains packages that have already been successfully validated.
 * They are carried through every recursive call and are NEVER checked again.
 *
 * `remaining` contains only packages that still need validation.
 *
 * This gives us two important properties:
 *
 *   1. A successful registry lookup happens only once per package.
 *   2. Every correction round gets faster because the list of packages
 *      requiring network requests becomes smaller.
 *
 * Example:
 *
 *   checkPackages(["react", "lodahs", "axios"])
 *
 *       found = []
 *       remaining = ["react", "lodahs", "axios"]
 *
 *   after first check:
 *
 *       found = ["react", "axios"]
 *       remaining = ["lodahs"]
 *
 *   user enters:
 *
 *       "lodash date-fns"
 *
 *   recursive call:
 *
 *       found = ["react", "axios"]
 *       remaining = ["lodash", "date-fns"]
 *
 *   after second check:
 *
 *       found = ["react", "axios", "lodash", "date-fns"]
 *       remaining = []
 *
 *   final result:
 *
 *       ["react", "axios", "lodash", "date-fns"]
 *
 * The recursion has no artificial maximum depth. It stops when either:
 *
 *   - all packages are valid, or
 *   - the user presses Escape / submits an empty correction.
 */
/*async function checkPackages(
  options: Readonly<{ packages: readonly string[]; found?: readonly string[] }>,
): Promise<string[]> {
  const { packages, found = [] } = options
  /!*
   * `found` represents packages that have already been verified.
   *
   * We remove duplicates here as well because the user can enter a package
   * that was already found during an earlier round.
   *
   * For example:
   *
   *   found:
   *     ["react"]
   *
   *   user enters:
   *     "react lodash"
   *
   * We don't want to check `react` again.
   *!/
  const known = ExtendedArray.from(found).unique()

  /!*
   * Only check packages that aren't already known to be valid.
   *
   * `uniquePackages()` also means duplicate entries in the current prompt
   * result in only one registry request.
   *!/
  const remaining = ExtendedArray.from(packages)
    .unique()
    .filter((pkg) => !known.includes(pkg))

  /!*
   * There may be nothing left to check.
   *
   * This can happen if the user enters only packages that were already
   * validated in a previous round.
   *!/
  if (remaining.isEmpty()) {
    if (known.isNotEmpty()) {
      log.success(
        ["Found packages", found.map((pkg) => `- ${pkg}`).join(os.EOL)].join(os.EOL),
      )

      return known
    }

    cancel("No packages were provided.")
    process.exit(1);
  }

  log.info("Checking packages on the npm registry...")

  /!*
   * Promise.all() preserves the order of `remaining`, even though the
   * individual network requests can complete in any order.
   *
   * For example:
   *
   *   remaining:
   *     ["lodash", "axios", "react"]
   *
   * Even if the HTTP requests finish in this order:
   *
   *     react
   *     lodash
   *     axios
   *
   * Promise.all() still returns:
   *
   *     [lodashResult, axiosResult, reactResult]
   *
   * This makes the subsequent processing deterministic.
   *!/
  const results = await Promise.all(
    [...remaining].map(async (pkg) => {
      const checked = await checkPackage(pkg)
      return checked
    }),
  )

  /!*
   * Extract the successful results while preserving the user's order.
   *
   * The registry may return a canonical package name, so we store `result.name`
   * rather than the original input string.
   *!/
  const newlyFound = ExtendedArray.from(results)
    .filter((result) => result.found)
    .map((result) => result.name)

  /!*
   * Missing packages use the original input rather than a registry-derived
   * name because there is no valid registry name to use.
   *!/
  const missing = ExtendedArray.from(results)
    .filter((result) => !result.found)
    .map((result) => result.input)

  /!*
   * Add this round's successful packages to our accumulated list.
   *
   * `Set` prevents duplicates. The array is then rebuilt from the Set so
   * insertion order is retained.
   *!/
  const allFound = ExtendedArray.from([...found, ...newlyFound]).unique()

  /!*
   * Success case: everything that needed checking was found.
   *!/
  if (missing.isEmpty()) {
    log.success(
      ["Found packages", allFound.map((pkg) => `- ${pkg}`).join(os.EOL)].join(os.EOL),
    )

    return allFound
  }

  /!*
   * Show everything that has been validated so far.
   *
   * This includes packages found during earlier recursive calls as well as
   * packages discovered during this call.
   *!/
  if (allFound.isNotEmpty()) {
    log.success(
      ["Found packages", allFound.map((pkg) => `- ${pkg}`).join(os.EOL)].join(os.EOL),
    )
  }

  log.warn(["Missing packages", missing.map((pkg) => `- ${pkg}`).join(os.EOL)].join(os.EOL))

  /!*
   * Only the missing packages are placed into the text input.
   *
   * This makes the correction workflow convenient:
   *
   *   react
   *   lodash_typo
   *   axios_typo
   *
   * becomes:
   *
   *   lodash_typo axios_typo
   *
   * The user doesn't have to retype `react`.
   *
   * However, the user can still type additional packages manually, so this
   * prompt also doubles as a way to add packages.
   *!/
  const result = await text({
    message:
      "Correct the missing packages or add more packages. Press `Escape` to continue with valid packages.",
    initialValue: missing.join(" "),
  })

  /!*
   * Escape means "stop correcting".
   *
   * If we already have valid packages, return them and allow the caller to
   * continue with those packages.
   *
   * If nothing has been validated, there is nothing useful for the caller to
   * continue with, so bail instead.
   *!/
  if (isCancel(result)) {
    if (allFound.isNotEmpty()) {
      return allFound
    }

    cancel("No valid packages were provided.")
    process.exit(1);
  }

  /!*
   * Convert the user's response into a package list.
   *
   * Multiple whitespace characters are treated as separators, so all of
   * these work:
   *
   *   lodash axios
   *   lodash    axios
   *   lodash\taxios
   *!/
  const correctedPackages = ExtendedArray.from(result.trim().split(/\s+/v)).filter(Boolean)

  /!*
   * An empty response is handled similarly to Escape.
   *
   * We don't recurse with an empty array because there is nothing left to
   * validate.
   *!/
  if (correctedPackages.isEmpty()) {
    if (allFound.isNotEmpty()) {
      return allFound
    }

    cancel("No valid packages were provided.")
    process.exit(1)
  }

  /!*
   * Start another validation round.
   *
   * IMPORTANT:
   *
   * `allFound` is passed separately from `correctedPackages`.
   *
   * This is what allows us to remember successful validations while only
   * checking the newly supplied/corrected packages.
   *
   * Previously validated packages will therefore NEVER cause another
   * registry request.
   *!/
  return checkPackages({ packages: correctedPackages, found: allFound })
}*/

export {
  checkIfPnpmIsAvailableStep,
  checkIfPnpmVersionIsSupportedStep,
  getPackagesFromCliArgsStep,
  getPackagesFromUserInputStep,
}
