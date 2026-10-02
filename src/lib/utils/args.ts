import { note } from "@clack/prompts"
import os from "node:os"

import { ExtendedArray } from "#lib/utils/array.js"

/**
 * Filters out flags like "--save-dev", "--save-exact", etc.,
 * as there are handled by the CLI tool.
 *
 * @param {readonly string[]} packages - list of packages to filter out flags from
 * @returns {ExtendedArray} packages
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

export { filterOutFlags }
