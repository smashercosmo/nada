import jsonPlugin from "@eslint/json"
import nodePlugin from "eslint-plugin-n"
import packageJsonPlugin from "eslint-plugin-package-json/experimental"
import { defineConfig, globalIgnores } from "eslint/config"
import { parser as tsParser } from "typescript-eslint"
import globals from "globals"

export default defineConfig([
  globalIgnores(["./repos/*"]),
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        ecmaVersion: "2024",
        projectService: true,
      },
      parser: tsParser,
    },
    plugins: { n: nodePlugin },
    rules: {
      "n/no-unsupported-features/es-builtins": "error",
      "n/no-unsupported-features/es-syntax": "error",
      "n/no-unsupported-features/node-builtins": "error",
    },
  },
  {
    files: ["**/package.json"],
    language: "json/json",
    name: "package-json",
    plugins: {
      json: jsonPlugin,
      "package-json": packageJsonPlugin,
    },
    rules: {
      //region ------------- Package.json rules -------------

      "package-json/bin-name-casing": "error",
      "package-json/exports-subpaths-style": "error",
      "package-json/no-empty-fields": "error",
      "package-json/no-local-dependencies": "error",
      "package-json/no-redundant-files": "error",
      "package-json/no-redundant-publishConfig": "error",
      "package-json/order-properties": "error",
      "package-json/prefer-rolling-workspace-spec": "error",
      "package-json/require-attribution": "error",
      "package-json/require-package-json-export": "error",
      "package-json/require-author": "error",
      "package-json/require-bin": "error",
      "package-json/require-bugs": "error",
      "package-json/require-contributors": "error",
      "package-json/require-dependencies": "error",
      "package-json/require-description": "error",
      "package-json/require-devDependencies": "error",
      "package-json/require-devEngines": "error",
      "package-json/require-directories": "error",
      "package-json/require-engines": "error",
      "package-json/require-exports": "error",
      "package-json/require-files": "error",
      "package-json/require-keywords": "error",
      "package-json/require-license": "error",
      "package-json/require-man": "error",
      "package-json/require-name": "error",
      "package-json/require-packageManager": "error",
      "package-json/require-private": "error",
      "package-json/require-publishConfig": "error",
      "package-json/require-repository": "error",
      "package-json/require-scripts": "error",
      "package-json/require-sideEffects": "error",
      "package-json/require-type": "error",
      "package-json/require-version": "error",
      "package-json/repository-shorthand": "error",
      "package-json/restrict-dependency-ranges": "error",
      "package-json/restrict-dist-tags": "error",
      "package-json/restrict-private-properties": "error",
      "package-json/restrict-top-level-properties": "error",
      "package-json/scripts-name-casing": "error",
      "package-json/sort-collections": "error",
      "package-json/specify-peers-locally": "error",
      "package-json/unique-dependencies": "error",
      "package-json/valid-author": "error",
      "package-json/valid-bin": "error",
      "package-json/valid-browser": "error",
      "package-json/valid-bugs": "error",
      "package-json/valid-bundleDependencies": "error",
      "package-json/valid-config": "error",
      "package-json/valid-contributors": "error",
      "package-json/valid-cpu": "error",
      "package-json/valid-description": "error",
      "package-json/valid-dependencies": "error",
      "package-json/valid-devDependencies": "error",
      "package-json/valid-devEngines": "error",
      "package-json/valid-directories": "error",
      "package-json/valid-engines": "error",
      "package-json/valid-exports": "error",
      "package-json/valid-files": "error",
      "package-json/valid-funding": "error",
      "package-json/valid-gypfile": "error",
      "package-json/valid-homepage": "error",
      "package-json/valid-keywords": "error",
      "package-json/valid-libc": "error",
      "package-json/valid-license": "error",
      "package-json/valid-main": "error",
      "package-json/valid-man": "error",
      "package-json/valid-module": "error",
      "package-json/valid-name": "error",
      "package-json/valid-optionalDependencies": "error",
      "package-json/valid-os": "error",
      "package-json/valid-packageManager": "error",
      "package-json/valid-peerDependencies": "error",
      "package-json/valid-peerDependenciesMeta": "error",
      "package-json/valid-private": "error",
      "package-json/valid-publishConfig": "error",
      "package-json/valid-repository": "error",
      "package-json/valid-scripts": "error",
      "package-json/valid-sideEffects": "error",
      "package-json/valid-type": "error",
      "package-json/valid-version": "error",
      "package-json/valid-workspaces": "error",
      "package-json/valid-peerDependenciesMeta-relationship": "error",
      "package-json/valid-repository-directory": "error",

      //endregion

      //region ------------- Disabled Package.json rules -------------

      /**
       * Never have I ever had a need in config property
       */
      "package-json/require-config": "off",

      /**
       * I wish, I wish... ahhhah :)
       */
      "package-json/funding": "off",

      /**
       * To be created. Someday. Maybe.
       */
      "package-json/homepage": "off",

      /**
       * We're just a simple CLI tool, Jim.
       * Node and PNPM is all we need.
       */
      "package-json/require-os": "off",
      "package-json/require-cpu": "off",
      "package-json/require-libc": "off",
      "package-json/require-gypfile": "off",

      /**
       * We won't probably have any in this package,
       * apart from @clack/prompts, which we're gonna bundle.
       */
      "package-json/require-optionalDependencies": "off",
      "package-json/require-peerDependencies": "off",
      "package-json/require-peerDependenciesMeta": "off",

      /**
       * Not sure if these fields are needed for
       * a CLI tool.
       * // TODO do research
       */
      "package-json/require-browser": "off",
      "package-json/require-main": "off",
      "package-json/require-module": "off",
      "package-json/require-types": "off",

      /**
       * Let's set it to warn as we might bundle @clack/prompts lib
       */
      "package-json/require-bundleDependencies": "warn",

      //endregion
    },
  },
])
