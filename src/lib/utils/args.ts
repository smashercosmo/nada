import { note } from "@clack/prompts"
import os from "node:os"

import { ExtendedArray } from "#lib/utils/array.js"
import packageJson from "#root/package.json" with { type: "json" }

/**
 * Filters out flags like "--save-dev", "--save-exact", etc.,
 * as there are handled by the CLI tool.
 *
 * @param {readonly string[]} packages - list of projects to filter out flags from
 * @returns {ExtendedArray} projects
 */
function filterOutFlags(packages: readonly string[]) {
  const args = ExtendedArray.from(packages)
    .unique()
    .filter((pkg) => pkg.startsWith("-"))

  if (args.isNotEmpty()) {
    note(
      [
        "This tool is purely interactive and doesn't need any flags.",
        "Passing them won't do any harm, as they will be completely ignored.",
      ].join(os.EOL),
      "About flags",
    )
  }

  return ExtendedArray.from(packages)
    .unique()
    .filter((pkg) => !pkg.startsWith("-"))
}

/**
 * Extracts packages list from the CLI arguments
 * with any non-relevant flags filtered out.
 */
function getPackagesFromCliArgs() {
  const BASE_ARGS_LENGTH = [packageJson.devEngines.packageManager.name, packageJson.name].length
  return filterOutFlags(process.argv.slice(BASE_ARGS_LENGTH))
}

export { filterOutFlags, getPackagesFromCliArgs }
