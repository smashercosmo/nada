import { log, cancel, text, select, isCancel } from "@clack/prompts"
import os from "node:os"
import process from "node:process"

import { filterOutFlags } from "#lib/utils/args.js"
import { getPackageInfo } from "#lib/utils/pnpm.js"
import { ExtendedArray } from "#lib/utils/array.js"

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NADA_DISABLE_GUIDE_LINES?: "true" | "false"
    }
  }
}

/**
 * Step 4
 */
async function getPackagesFromUserInput() {
  const result = await text({
    message:
      "Which packages you want to install? You can enter space- or comma-separated list of names",
    placeholder: "react react-router",
  })

  const packages = filterOutFlags(typeof result === "string" ? result.split(/\s+/v) : [])

  if (packages.isEmpty()) {
    const choice = await select({
      message: [
        "You haven't specified any projects to install.",
        "Would you like yo try again or exit?",
      ].join(os.EOL),
      options: [{ value: "Try again" }, { value: "Exit" }],
    })

    if (choice === "Exit") {
      cancel("Good bye, See you,")
      process.exit(1)
    }

    if (choice === "Try again") {
      return getPackagesFromUserInput()
    }
  }

  return packages
}

/**
 * Checks one package against the npm registry.
 *
 * Errors are converted into a `found: false` result rather than being thrown.
 * This is important because one failed registry request must not prevent the
 * remaining projects from being checked.
 */
async function checkPackage(pkg: string) {
  const [info, error] = await getPackageInfo(pkg)

  if (error) {
    if (process.env.NADA_REPORTER === "verbose") {
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
}

/**
 * Recursively validates projects against the npm registry.
 *
 * `found` contains projects that have already been successfully validated.
 * They are carried through every recursive call and are NEVER checked again.
 *
 * `remaining` contains only projects that still need validation.
 *
 * This gives us two important properties:
 *
 *   1. A successful registry lookup happens only once per package.
 *   2. Every correction round gets faster because the list of projects
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
 *   - all projects are valid, or
 *   - the user presses Escape / submits an empty correction.
 */
export async function checkPackages(
  options: Readonly<{ packages: readonly string[]; found?: readonly string[] }>,
) {
  const { packages, found = [] } = options
  /**
   * `found` represents projects that have already been verified.
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
   */
  const known = ExtendedArray.from(found).unique()

  /**
   * Only check projects that aren't already known to be valid.
   *
   * `uniquePackages()` also means duplicate entries in the current prompt
   * result in only one registry request.
   */
  const remaining = ExtendedArray.from(packages)
    .unique()
    .filter((pkg) => !known.includes(pkg))

  /**
   * There may be nothing left to check.
   *
   * This can happen if the user enters only projects already
   * validated in a previous round.
   */
  if (remaining.isEmpty()) {
    if (known.isNotEmpty()) {
      log.success(
        ["Found projects", found.map((pkg) => `- ${pkg}`).join(os.EOL)].join(os.EOL),
      )

      return known
    }

    cancel("No projects were provided.")
    process.exit(1);
  }

  log.info("Checking projects on the npm registry...")

  const results = await Promise.all(
    [...remaining].map(async (pkg) => {
      const checked = await checkPackage(pkg)
      return checked
    }),
  )

  /**
   * Extract the successful results while preserving the user's order.
   *
   * The registry may return a canonical package name, so we store `result.name`
   * rather than the original input string.
   */
  const newlyFound = ExtendedArray.from(results)
    .filter((result) => result.found)
    .map((result) => result.name)
    .compact()

  /**
   * Missing projects use the original input rather than a registry-derived
   * name because there is no valid registry name to use.
   */
  const missing = ExtendedArray.from(results)
    .filter((result) => !result.found)
    .map((result) => result.input)

  /**
   * Add this round's successful projects to our accumulated list.
   */
  const allFound = ExtendedArray.from([...found, ...newlyFound]).unique()

  /**
   * Success case: everything that needed checking was found.
   */
  if (missing.isEmpty()) {
    log.success(
      ["Found projects", allFound.map((pkg) => `- ${pkg}`).join(os.EOL)].join(os.EOL),
    )

    return allFound
  }

  /**
   * Show everything that has been validated so far.
   *
   * This includes projects found during earlier recursive calls as well as
   * projects discovered during this call.
   */
  if (allFound.isNotEmpty()) {
    log.success(
      ["Found projects", allFound.map((pkg) => `- ${pkg}`).join(os.EOL)].join(os.EOL),
    )
  }

  log.warn(["Missing projects", missing.map((pkg) => `- ${pkg}`).join(os.EOL)].join(os.EOL))

  /**
   * Only the missing projects are placed into the text input.
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
   * However, the user can still type additional projects manually, so this
   * prompt also doubles as a way to add projects.
   */
  const result = await text({
    message:
      "Correct the missing projects or add more projects. Press `Escape` to continue with valid projects.",
    initialValue: missing.join(" "),
  })

  /**
   * Escape means "stop correcting".
   *
   * If we already have valid projects, return them and allow the caller to
   * continue with those projects.
   *
   * If nothing has been validated, there is nothing useful for the caller to
   * continue with, so bail instead.
   */
  if (isCancel(result)) {
    if (allFound.isNotEmpty()) {
      return allFound
    }

    cancel("No valid projects were provided.")
    process.exit(1);
  }

  /**
   * Convert the user's response into a package list.
   *
   * Multiple whitespace characters are treated as separators, so all of
   * these work:
   *
   *   lodash axios
   *   lodash    axios
   *   lodash\taxios
   */
  const correctedPackages = ExtendedArray.from(result.trim().split(/\s+/v)).filter(Boolean)

  /**
   * An empty response is handled similarly to Escape.
   *
   * We don't recurse with an empty array because there is nothing left to
   * validate.
   */
  if (correctedPackages.isEmpty()) {
    if (allFound.isNotEmpty()) {
      return allFound
    }

    cancel("No valid projects were provided.")
    process.exit(1)
  }

  /**
   * Start another validation round.
   *
   * `allFound` is passed separately from `correctedPackages`.
   *
   * This is what allows us to remember successful validations while only
   * checking the newly supplied/corrected projects.
   *
   * Previously validated projects will therefore NEVER cause another
   * registry request.
   */
  return checkPackages({ packages: correctedPackages, found: allFound })
}

export {
  getPackagesFromUserInput,
}
