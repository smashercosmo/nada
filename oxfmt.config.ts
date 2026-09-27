import { defineConfig } from "oxfmt"

export default defineConfig({
  $schema: "./node_modules/oxfmt/configuration_schema.json",
  semi: false,
  singleQuote: false,
  jsxSingleQuote: false,
  trailingComma: "all",
  arrowParens: "always",
  bracketSpacing: true,
  /** Sorting is handled by eslint-plugin-package-json */
  sortPackageJson: false,
  experimentalOperatorPosition: "end",
  proseWrap: "always",
  sortImports: {
    newlinesBetween: true,
    groups: [
      "type-import",
      ["value-builtin", "value-external"],
      "type-internal",
      "value-internal",
      ["type-parent", "type-sibling", "type-index"],
      ["value-parent", "value-sibling", "value-index"],
      "unknown",
    ],
  },
})
