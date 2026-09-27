import type { OxlintConfig } from "oxlint"

import { defineConfig } from "oxlint"

const config: OxlintConfig = {
  env: {
    builtin: true,
  },
  ignorePatterns: ["src/lib/utils", "./test.ts"],
  jsPlugins: [
    { name: "regexp", specifier: "eslint-plugin-regexp" },
  ],
  options: {
    typeAware: true,
  },
  plugins: ["unicorn", "eslint", "import", "node", "typescript", "vitest", "promise", "oxc"],
  rules: {
    //region ------------- Unicorn rules -------------

    "unicorn/catch-error-name": "error",
    "unicorn/consistent-assert": "error",
    "unicorn/consistent-date-clone": "error",
    "unicorn/consistent-empty-array-spread": "error",
    "unicorn/consistent-existence-index-check": "error",
    "unicorn/consistent-function-scoping": "error",
    "unicorn/consistent-template-literal-escape": "error",
    "unicorn/custom-error-definition": "error",
    "unicorn/empty-brace-spaces": "error",
    "unicorn/error-message": "error",
    "unicorn/escape-case": "error",
    "unicorn/explicit-length-check": "error",
    "unicorn/explicit-timer-delay": "error",
    "unicorn/import-style": "error",
    "unicorn/max-nested-calls": "error",
    "unicorn/new-for-builtins": "error",
    "unicorn/no-abusive-eslint-disable": "error",
    "unicorn/no-accessor-recursion": "error",
    "unicorn/no-anonymous-default-export": "error",
    "unicorn/no-array-callback-reference": "error",
    "unicorn/no-array-fill-with-reference-type": "error",
    "unicorn/no-array-for-each": "error",
    "unicorn/no-array-method-this-argument": "error",
    "unicorn/no-array-reduce": "error",
    "unicorn/no-array-reverse": "error",
    "unicorn/no-array-sort": "error",
    "unicorn/no-await-expression-member": "error",
    "unicorn/no-await-in-promise-methods": "error",
    "unicorn/no-confusing-array-with": "error",
    "unicorn/no-console-spaces": "error",
    "unicorn/no-document-cookie": "error",
    "unicorn/no-empty-file": "error",
    "unicorn/no-hex-escape": "error",
    "unicorn/no-immediate-mutation": "error",
    "unicorn/no-instanceof-array": "error",
    "unicorn/no-instanceof-builtins": "error",
    "unicorn/no-invalid-fetch-options": "error",
    "unicorn/no-invalid-remove-event-listener": "error",
    "unicorn/no-length-as-slice-end": "error",
    "unicorn/no-lonely-if": "error",
    "unicorn/no-magic-array-flat-depth": "error",
    "unicorn/no-negated-condition": "error",
    "unicorn/no-negation-in-equality-check": "error",
    "unicorn/no-new-array": "error",
    "unicorn/no-new-buffer": "error",
    "unicorn/no-null": "error",
    "unicorn/no-object-as-default-parameter": "error",
    "unicorn/no-process-exit": "error",
    "unicorn/no-single-promise-in-promise-methods": "error",
    "unicorn/no-static-only-class": "error",
    "unicorn/no-thenable": "error",
    "unicorn/no-this-assignment": "error",
    "unicorn/no-typeof-undefined": "error",
    "unicorn/no-unnecessary-array-flat-depth": "error",
    "unicorn/no-unnecessary-array-splice-count": "error",
    "unicorn/no-unnecessary-await": "error",
    "unicorn/no-unnecessary-slice-end": "error",
    "unicorn/no-unreadable-array-destructuring": "error",
    "unicorn/no-unreadable-iife": "error",
    "unicorn/no-useless-collection-argument": "error",
    "unicorn/no-useless-error-capture-stack-trace": "error",
    "unicorn/no-useless-fallback-in-spread": "error",
    "unicorn/no-useless-iterator-to-array": "error",
    "unicorn/no-useless-length-check": "error",
    "unicorn/no-useless-promise-resolve-reject": "error",
    "unicorn/no-useless-spread": "error",
    "unicorn/no-useless-switch-case": "error",
    "unicorn/no-useless-undefined": "error",
    "unicorn/no-zero-fractions": "error",
    "unicorn/number-literal-case": "error",
    "unicorn/numeric-separators-style": "error",
    "unicorn/prefer-add-event-listener": "error",
    "unicorn/prefer-array-find": "error",
    "unicorn/prefer-array-flat": "error",
    "unicorn/prefer-array-flat-map": "error",
    "unicorn/prefer-array-index-of": "error",
    "unicorn/prefer-array-some": "error",
    "unicorn/prefer-at": "error",
    "unicorn/prefer-bigint-literals": "error",
    "unicorn/prefer-blob-reading-methods": "error",
    "unicorn/prefer-class-fields": "error",
    "unicorn/prefer-classlist-toggle": "error",
    "unicorn/prefer-code-point": "error",
    "unicorn/prefer-date-now": "error",
    "unicorn/prefer-default-parameters": "error",
    "unicorn/prefer-dom-node-append": "error",
    "unicorn/prefer-dom-node-dataset": "error",
    "unicorn/prefer-dom-node-remove": "error",
    "unicorn/prefer-dom-node-text-content": "error",
    "unicorn/prefer-event-target": "error",
    "unicorn/prefer-export-from": "error",
    "unicorn/prefer-global-this": "error",
    "unicorn/prefer-import-meta-properties": "error",
    "unicorn/prefer-includes": "error",
    "unicorn/prefer-keyboard-event-key": "error",
    "unicorn/prefer-logical-operator-over-ternary": "error",
    "unicorn/prefer-math-min-max": "error",
    "unicorn/prefer-math-trunc": "error",
    "unicorn/prefer-modern-dom-apis": "error",
    "unicorn/prefer-modern-math-apis": "error",
    "unicorn/prefer-module": "error",
    "unicorn/prefer-native-coercion-functions": "error",
    "unicorn/prefer-negative-index": "error",
    "unicorn/prefer-node-protocol": "error",
    "unicorn/prefer-number-coercion": "error",
    "unicorn/prefer-number-properties": "error",
    "unicorn/prefer-object-from-entries": "error",
    "unicorn/prefer-optional-catch-binding": "error",
    "unicorn/prefer-prototype-methods": "error",
    "unicorn/prefer-query-selector": "error",
    "unicorn/prefer-reflect-apply": "error",
    "unicorn/prefer-regexp-test": "error",
    "unicorn/prefer-response-static-json": "error",
    "unicorn/prefer-set-has": "error",
    "unicorn/prefer-set-size": "error",
    "unicorn/prefer-single-call": "error",
    "unicorn/prefer-spread": "error",
    "unicorn/prefer-string-raw": "error",
    "unicorn/prefer-string-replace-all": "error",
    "unicorn/prefer-string-slice": "error",
    "unicorn/prefer-string-starts-ends-with": "error",
    "unicorn/prefer-string-trim-start-end": "error",
    "unicorn/prefer-structured-clone": "error",
    "unicorn/prefer-ternary": "error",
    "unicorn/prefer-top-level-await": "error",
    "unicorn/prefer-type-error": "error",
    "unicorn/relative-url-style": "error",
    "unicorn/require-array-join-separator": "error",
    "unicorn/require-module-attributes": "error",
    "unicorn/require-module-specifiers": "error",
    "unicorn/require-number-to-fixed-digits-argument": "error",
    "unicorn/require-post-message-target-origin": "error",
    "unicorn/switch-case-braces": "error",
    "unicorn/switch-case-break-position": "error",
    "unicorn/text-encoding-identifier-case": "error",
    "unicorn/throw-new-error": "error",

    //endregion

    //region ------------- Modified Unicorn rules -------------

    /**
     * We prefer camelCased file names. But disabling the rule temporarily, as
     * it seems like oxlint doesn't support setting options for the rule
     */
    "unicorn/filename-case": [
      "error",
      {
        case: "kebabCase",
      },
    ],

    //endregion

    //region ------------- Disabled Unicorn rules -------------

    /**
     * @see {no-nested-ternary} for explanation
     */
    "unicorn/no-nested-ternary": "off",

    /**
     *
     */
    "unicorn/max-nested-calls": "off",

    //endregion

    //region ------------- ESLint rules -------------

    "accessor-pairs": "error",
    "array-callback-return": "error",
    "arrow-body-style": "error",
    "block-scoped-var": "error",
    "class-methods-use-this": "error",
    complexity: "error",
    "constructor-super": "error",
    curly: "error",
    "default-case": "error",
    "default-case-last": "error",
    "default-param-last": "error",
    eqeqeq: "error",
    "for-direction": "error",
    "func-name-matching": "error",
    "func-names": "error",
    "getter-return": "error",
    "grouped-accessor-pairs": "error",
    "guard-for-in": "error",
    "id-denylist": "error",
    "id-length": "error",
    "id-match": "error",
    "init-declarations": "error",
    "logical-assignment-operators": "error",
    "max-classes-per-file": "error",
    "max-depth": "error",
    "max-nested-callbacks": "error",
    "max-params": "error",
    "new-cap": "error",
    "no-alert": "error",
    "no-array-constructor": "error",
    "no-async-promise-executor": "error",
    "no-await-in-loop": "error",
    "no-bitwise": "error",
    "no-caller": "error",
    "no-case-declarations": "error",
    "no-class-assign": "error",
    "no-compare-neg-zero": "error",
    "no-cond-assign": "error",
    "no-const-assign": "error",
    "no-constant-binary-expression": "error",
    "no-constant-condition": "error",
    "no-constructor-return": "error",
    "no-continue": "error",
    "no-control-regex": "error",
    "no-debugger": "error",
    "no-delete-var": "error",
    "no-div-regex": "error",
    "no-dupe-class-members": "error",
    "no-dupe-else-if": "error",
    "no-dupe-keys": "error",
    "no-duplicate-case": "error",
    "no-else-return": "error",
    "no-empty": "error",
    "no-empty-character-class": "error",
    "no-empty-function": "error",
    "no-empty-pattern": "error",
    "no-empty-static-block": "error",
    "no-eq-null": "error",
    "no-eval": "error",
    "no-ex-assign": "error",
    "no-extend-native": "error",
    "no-extra-bind": "error",
    "no-extra-boolean-cast": "error",
    "no-extra-label": "error",
    "no-fallthrough": "error",
    "no-func-assign": "error",
    "no-global-assign": "error",
    "no-implicit-coercion": "error",
    "no-implicit-globals": "error",
    "no-implied-eval": "error",
    "no-import-assign": "error",
    "no-inline-comments": "error",
    "no-inner-declarations": "error",
    "no-invalid-regexp": "error",
    "no-irregular-whitespace": "error",
    "no-iterator": "error",
    "no-label-var": "error",
    "no-labels": "error",
    "no-lone-blocks": "error",
    "no-lonely-if": "error",
    "no-loop-func": "error",
    "no-loss-of-precision": "error",
    "no-misleading-character-class": "error",
    "no-multi-assign": "error",
    "no-multi-str": "error",
    "no-negated-condition": "error",
    "no-new": "error",
    "no-new-func": "error",
    "no-new-native-nonconstructor": "error",
    "no-new-wrappers": "error",
    "no-nonoctal-decimal-escape": "error",
    "no-obj-calls": "error",
    "no-object-constructor": "error",
    "no-param-reassign": "error",
    "no-plusplus": "error",
    "no-promise-executor-return": "error",
    "no-proto": "error",
    "no-prototype-builtins": "error",
    "no-redeclare": "error",
    "no-regex-spaces": "error",
    "no-restricted-exports": "error",
    "no-restricted-globals": "error",
    "no-restricted-imports": "error",
    "no-restricted-properties": "error",
    "no-return-assign": "error",
    "no-script-url": "error",
    "no-self-assign": "error",
    "no-self-compare": "error",
    "no-sequences": "error",
    "no-setter-return": "error",
    "no-shadow": "error",
    "no-shadow-restricted-names": "error",
    "no-sparse-arrays": "error",
    "no-template-curly-in-string": "error",
    "no-this-before-super": "error",
    "no-throw-literal": "error",
    "no-unassigned-vars": "error",
    "no-undef": "error",
    "no-underscore-dangle": "error",
    "no-unexpected-multiline": "error",
    "no-unmodified-loop-condition": "error",
    "no-unneeded-ternary": "error",
    "no-unreachable": "error",
    "no-unreachable-loop": "error",
    "no-unsafe-finally": "error",
    "no-unsafe-negation": "error",
    "no-unsafe-optional-chaining": "error",
    "no-unused-expressions": "error",
    "no-unused-labels": "error",
    "no-unused-private-class-members": "error",
    "no-unused-vars": "error",
    "no-use-before-define": "error",
    "no-useless-assignment": "error",
    "no-useless-backreference": "error",
    "no-useless-call": "error",
    "no-useless-catch": "error",
    "no-useless-computed-key": "error",
    "no-useless-concat": "error",
    "no-useless-constructor": "error",
    "no-useless-escape": "error",
    "no-useless-rename": "error",
    "no-useless-return": "error",
    "no-var": "error",
    "no-warning-comments": "error",
    "no-with": "error",
    "object-shorthand": "error",
    "operator-assignment": "error",
    "prefer-arrow-callback": "error",
    "prefer-const": "error",
    "prefer-destructuring": "error",
    "prefer-exponentiation-operator": "error",
    "prefer-named-capture-group": "error",
    "prefer-numeric-literals": "error",
    "prefer-object-has-own": "error",
    "prefer-object-spread": "error",
    "prefer-promise-reject-errors": "error",
    "prefer-regex-literals": "error",
    "prefer-rest-params": "error",
    "prefer-spread": "error",
    "prefer-template": "error",
    "preserve-caught-error": "error",
    radix: "error",
    "require-await": "error",
    "require-unicode-regexp": "error",
    "require-yield": "error",
    "sort-vars": "error",
    "symbol-description": "error",
    "unicode-bom": "error",
    "use-isnan": "error",
    "valid-typeof": "error",
    "vars-on-top": "error",
    yoda: "error",

    //endregion

    //region ------------- Modified ESLint rules -------------

    /**
     * To allow region/endregion comments, which
     * must start with a lowercase letter.
     */
    "capitalized-comments": ["error", "always", { ignorePattern: "^(region|endregion)" }],

    /**
     * I like to have type-only and all other imports in
     * two separate import statements from the same module.
     *
     * Example:
     * ```ts
     * import type { SomeType } from "some-package";
     * import { someFn } from "some-package";
     * ```
     */
    "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],

    /**
     * This article explains it all
     * https://hudochenkov.com/posts/prefer-function-declarations/
     */
    "func-style": ["error", "declaration"],

    /**
     * `console.log` is definitely something that shouldn't
     * accidentally go left in production code. But `warn` and `error` methods
     * are usually there for a reason.
     */
    "no-console": ["error", { allow: ["warn", "error"] }],

    /**
     * Kinda helpful rule in certain citations,
     * but mostly annoying. Might either add more "ignore" options,
     * or disable the rule completely.
     *
     * { ignore: ["0"] } is mainly for checking array length.
     *
     * Example:
     * ```ts
     * if (arr.length > 0) {}
     * ```
     */
    "no-magic-numbers": [
      "error",
      { ignoreArrayIndexes: true, detectObjects: true, enforceConst: true, ignore: [0] },
    ],

    /**
     * To be able to explicitly mark non-awaited promises as
     * "floating" following `typescript/no-floating-promises` rule.
     *
     * Example:
     * ```ts
     *  void (async () => {
     *    await main()
     *  })()
     * ``
     */
    "no-void": ["error", { allowAsStatement: true }],

    //endregion

    //region ------------- Disabled ESLint rules -------------

    /**
     * Oxfmt is now responsible for sorting unports. Later we'll try
     * eslint-plugin-perfectionist.
     */
    "sort-imports": "off",

    /**
     * Pretty annoying rule, as it's not autofixable. Later we'll try
     * eslint-plugin-perfectionist for all kinds of sorting.
     */
    "sort-keys": "off",

    /**
     * Sometimes it's better to have one big function,
     * Sometimes it's better to split it into multiple single-purposed functions.
     * Sometimes it's better to keep everything in one file,
     * sometimes it's better to extract some code into separate modules.
     * Should be decided on a per-case basis.
     */
    "max-lines": "off",
    "max-lines-per-function": "off",

    /**
     * Disabling this rule in favour of unicorn/no-typeof-undefined,
     * which is more reasonable in my opinion.
     *
     * Example:
     * ```ts
     * if (someVar === undefined) {} // is much better than
     * if (typeof someVar === "undefined") {}
     */
    "no-undefined": "off",

    /**
     * Sorry, but I just love ternaries even when they're
     * three levels nested. Might be slightly unreadable, but
     * visually - just pure beauty :)
     * @type no-nested-ternary
     */
    "no-nested-ternary": "off",
    "no-ternary": "off",

    //endregion

    //region ------------- Type aware TS rules -------------

    "typescript/await-thenable": "error",
    "typescript/no-array-delete": "error",
    "typescript/no-base-to-string": "error",
    "typescript/no-confusing-void-expression": "error",
    "typescript/no-duplicate-type-constituents": "error",
    "typescript/no-floating-promises": "error",
    "typescript/no-for-in-array": "error",
    "typescript/no-implied-eval": "error",
    "typescript/no-meaningless-void-operator": "error",
    "typescript/no-misused-promises": "error",
    "typescript/no-misused-spread": "error",
    "typescript/no-mixed-enums": "error",
    "typescript/no-redundant-type-constituents": "error",
    "typescript/no-unnecessary-boolean-literal-compare": "error",
    "typescript/no-unnecessary-template-expression": "error",
    "typescript/no-unnecessary-type-arguments": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-enum-comparison": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-unsafe-type-assertion": "error",
    "typescript/no-unsafe-unary-minus": "error",
    "typescript/non-nullable-type-assertion-style": "error",
    "typescript/only-throw-error": "error",
    "typescript/prefer-promise-reject-errors": "error",
    "typescript/prefer-reduce-type-parameter": "error",
    "typescript/prefer-return-this-type": "error",
    "typescript/promise-function-async": "error",
    "typescript/related-getter-setter-pairs": "error",
    "typescript/require-array-sort-compare": "error",
    "typescript/require-await": "error",
    "typescript/restrict-plus-operands": "error",
    "typescript/restrict-template-expressions": "error",
    "typescript/return-await": "error",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/unbound-method": "error",
    "typescript/use-unknown-in-catch-callback-variable": "error",

    //endregion

    //region ------------- Disabled type aware TS rules -------------

    /**
     * These no-unsafe-* rules are extremely cryptic.
     * No idea how to follow them.
     */
    "typescript/no-unsafe-assignment": "off",
    "typescript/no-unsafe-call": "off",
    "typescript/no-unsafe-member-access": "off",

    //endregion

    //region ------------- Rest TS rules -------------

    "typescript/adjacent-overload-signatures": "error",
    "typescript/array-type": "error",
    "typescript/ban-ts-comment": "error",
    "typescript/ban-tslint-comment": "error",
    "typescript/ban-types": "error",
    "typescript/class-literal-property-style": "error",
    "typescript/consistent-generic-constructors": "error",
    "typescript/consistent-indexed-object-style": "error",
    "typescript/consistent-return": "error",
    "typescript/consistent-type-assertions": "error",
    "typescript/consistent-type-definitions": "error",
    "typescript/consistent-type-exports": "error",
    "typescript/consistent-type-imports": "error",
    "typescript/dot-notation": "error",
    "typescript/explicit-member-accessibility": "error",
    "typescript/method-signature-style": "error",
    "typescript/no-confusing-non-null-assertion": "error",
    "typescript/no-deprecated": "error",
    "typescript/no-duplicate-enum-values": "error",
    "typescript/no-dynamic-delete": "error",
    "typescript/no-empty-interface": "error",
    "typescript/no-empty-object-type": "error",
    "typescript/no-explicit-any": "error",
    "typescript/no-extra-non-null-assertion": "error",
    "typescript/no-extraneous-class": "error",
    "typescript/no-import-type-side-effects": "error",
    "typescript/no-inferrable-types": "error",
    "typescript/no-invalid-void-type": "error",
    "typescript/no-misused-new": "error",
    "typescript/no-non-null-asserted-nullish-coalescing": "error",
    "typescript/no-non-null-asserted-optional-chain": "error",
    "typescript/no-non-null-assertion": "error",
    "typescript/no-require-imports": "error",
    "typescript/no-restricted-types": "error",
    "typescript/no-this-alias": "error",
    "typescript/no-unnecessary-condition": "error",
    "typescript/no-unnecessary-parameter-property-assignment": "error",
    "typescript/no-unnecessary-qualifier": "error",
    "typescript/no-unnecessary-type-constraint": "error",
    "typescript/no-unnecessary-type-conversion": "error",
    "typescript/no-unnecessary-type-parameters": "error",
    "typescript/no-unsafe-declaration-merging": "error",
    "typescript/no-unsafe-function-type": "error",
    "typescript/no-useless-default-assignment": "error",
    "typescript/no-useless-empty-export": "error",
    "typescript/no-var-requires": "error",
    "typescript/no-wrapper-object-types": "error",
    "typescript/parameter-properties": "error",
    "typescript/prefer-as-const": "error",
    "typescript/prefer-enum-initializers": "error",
    "typescript/prefer-find": "error",
    "typescript/prefer-for-of": "error",
    "typescript/prefer-function-type": "error",
    "typescript/prefer-includes": "error",
    "typescript/prefer-literal-enum-member": "error",
    "typescript/prefer-namespace-keyword": "error",
    "typescript/prefer-nullish-coalescing": "error",
    "typescript/prefer-optional-chain": "error",
    "typescript/prefer-readonly": "error",
    "typescript/prefer-regexp-exec": "error",
    "typescript/prefer-string-starts-ends-with": "error",
    "typescript/prefer-ts-expect-error": "error",
    "typescript/strict-boolean-expressions": "error",
    "typescript/strict-void-return": "error",
    "typescript/triple-slash-reference": "error",
    "typescript/unified-signatures": "error",

    //endregion

    //region ------------- Modified TS rules -------------

    "typescript/prefer-readonly-parameter-types": [
      "error",
      /**
       * We can't control third-party params,
       * that are inferred. We can annotate them
       * explicitly, but that's an overkill.
       *
       * Example:
       * ```ts
       * import { it } from 'vitest'
       * // `context` param is inferred and can be made readonly
       * // only by explicit annotation
       * it("should do something", async (context) => {
       *   // some test code
       * });
       * ```
       */
      { ignoreInferredTypes: true },
    ],

    //endregion

    //region ------------- Disabled TS rules -------------

    /**
     * TypeScript is good at inferring. It's pretty annoying
     * to explicitly annotate functions and variables. It
     * can be useful when a function has a lot of code paths.
     * When it's the case, use your own judgement.
     */
    "typescript/explicit-module-boundary-types": "off",
    "typescript/explicit-function-return-type": "off",

    //endregion

    //region ------------- RegExp rules -------------

    "regexp/confusing-quantifier": "error",
    "regexp/control-character-escape": "error",
    "regexp/grapheme-string-literal": "error",
    "regexp/hexadecimal-escape": "error",
    "regexp/letter-case": "error",
    "regexp/match-any": "error",
    "regexp/negation": "error",
    "regexp/no-contradiction-with-assertion": "error",
    "regexp/no-control-character": "error",
    "regexp/no-dupe-characters-character-class": "error",
    "regexp/no-dupe-disjunctions": "error",
    "regexp/no-empty-alternative": "error",
    "regexp/no-empty-capturing-group": "error",
    "regexp/no-empty-character-class": "error",
    "regexp/no-empty-group": "error",
    "regexp/no-empty-lookarounds-assertion": "error",
    "regexp/no-empty-string-literal": "error",
    "regexp/no-escape-backspace": "error",
    "regexp/no-extra-lookaround-assertions": "error",
    "regexp/no-invalid-regexp": "error",
    "regexp/no-invisible-character": "error",
    "regexp/no-lazy-ends": "error",
    "regexp/no-legacy-features": "error",
    "regexp/no-misleading-capturing-group": "error",
    "regexp/no-misleading-unicode-character": "error",
    "regexp/no-missing-g-flag": "error",
    "regexp/no-non-standard-flag": "error",
    "regexp/no-obscure-range": "error",
    "regexp/no-octal": "error",
    "regexp/no-optional-assertion": "error",
    "regexp/no-potentially-useless-backreference": "error",
    "regexp/no-standalone-backslash": "error",
    "regexp/no-super-linear-backtracking": "error",
    "regexp/no-super-linear-move": "error",
    "regexp/no-trivially-nested-assertion": "error",
    "regexp/no-trivially-nested-quantifier": "error",
    "regexp/no-unused-capturing-group": "error",
    "regexp/no-useless-assertions": "error",
    "regexp/no-useless-backreference": "error",
    "regexp/no-useless-character-class": "error",
    "regexp/no-useless-dollar-replacements": "error",
    "regexp/no-useless-escape": "error",
    "regexp/no-useless-flag": "error",
    "regexp/no-useless-lazy": "error",
    "regexp/no-useless-non-capturing-group": "error",
    "regexp/no-useless-quantifier": "error",
    "regexp/no-useless-range": "error",
    "regexp/no-useless-set-operand": "error",
    "regexp/no-useless-string-literal": "error",
    "regexp/no-useless-two-nums-quantifier": "error",
    "regexp/no-zero-quantifier": "error",
    "regexp/optimal-lookaround-quantifier": "error",
    "regexp/optimal-quantifier-concatenation": "error",
    "regexp/prefer-character-class": "error",
    "regexp/prefer-d": "error",
    "regexp/prefer-escape-replacement-dollar-char": "error",
    "regexp/prefer-lookaround": "error",
    "regexp/prefer-named-backreference": "error",
    "regexp/prefer-named-capture-group": "error",
    "regexp/prefer-named-replacement": "error",
    "regexp/prefer-plus-quantifier": "error",
    "regexp/prefer-predefined-assertion": "error",
    "regexp/prefer-quantifier": "error",
    "regexp/prefer-question-quantifier": "error",
    "regexp/prefer-range": "error",
    "regexp/prefer-regexp-exec": "error",
    "regexp/prefer-regexp-test": "error",
    "regexp/prefer-result-array-groups": "error",
    "regexp/prefer-set-operation": "error",
    "regexp/prefer-star-quantifier": "error",
    "regexp/prefer-unicode-codepoint-escapes": "error",
    "regexp/prefer-w": "error",
    "regexp/require-unicode-regexp": "error",
    "regexp/require-unicode-sets-regexp": "error",
    "regexp/simplify-set-operations": "error",
    "regexp/sort-alternatives": "error",
    "regexp/sort-character-class-elements": "error",
    "regexp/sort-flags": "error",
    "regexp/strict": "error",
    "regexp/unicode-escape": "error",
    "regexp/unicode-property": "error",
    "regexp/use-ignore-case": "error",

    //endregion

    //region ------------- Import rules -------------

    "import/consistent-type-specifier-style": "error",
    "import/default": "error",
    "import/export": "error",
    "import/exports-last": "error",
    "import/extensions": "error",
    "import/first": "error",
    "import/group-exports": "error",
    "import/max-dependencies": "error",
    "import/named": "error",
    "import/namespace": "error",
    "import/newline-after-import": "error",
    "import/no-absolute-path": "error",
    "import/no-amd": "error",
    "import/no-anonymous-default-export": "error",
    "import/no-commonjs": "error",
    "import/no-cycle": "error",
    "import/no-default-export": "error",
    "import/no-duplicates": "error",
    "import/no-dynamic-require": "error",
    "import/no-empty-named-blocks": "error",
    "import/no-mutable-exports": "error",
    "import/no-named-as-default": "error",
    "import/no-named-as-default-member": "error",
    "import/no-named-default": "error",
    "import/no-namespace": "error",
    "import/no-relative-parent-imports": "error",
    "import/no-self-import": "error",
    "import/no-unassigned-import": "error",
    "import/no-webpack-loader-syntax": "error",
    "import/unambiguous": "error",

    //endregion

    //region ------------- Disabled import rules -------------

    /**
     * Named exports are the best:
     * https://humanwhocodes.com/blog/2019/01/stop-using-default-exports-javascript-module/
     */
    "import/no-named-export": "off",

    //endregion

    //region ------------- OXC rules -------------

    "oxc/approx-constant": "error",
    "oxc/bad-array-method-on-arguments": "error",
    "oxc/bad-bitwise-operator": "error",
    "oxc/bad-char-at-comparison": "error",
    "oxc/bad-comparison-sequence": "error",
    "oxc/bad-match-all-arg": "error",
    "oxc/bad-min-max-func": "error",
    "oxc/bad-object-literal-comparison": "error",
    "oxc/bad-replace-all-arg": "error",
    "oxc/branches-sharing-code": "error",
    "oxc/const-comparisons": "error",
    "oxc/double-comparisons": "error",
    "oxc/erasing-op": "error",
    "oxc/misrefactored-assign-op": "error",
    "oxc/missing-throw": "error",
    "oxc/no-accumulating-spread": "error",
    "oxc/no-async-endpoint-handlers": "error",
    "oxc/no-barrel-file": "error",
    "oxc/no-const-enum": "error",
    "oxc/no-map-spread": "error",
    "oxc/no-this-in-exported-function": "error",
    "oxc/number-arg-out-of-range": "error",
    "oxc/only-used-in-recursion": "error",
    "oxc/uninvoked-array-callback": "error",

    //endregion

    //region ------------- Node rules -------------

    "node/callback-return": "error",
    "node/exports-style": "error",
    "node/global-require": "error",
    "node/handle-callback-err": "error",
    "node/no-exports-assign": "error",
    "node/no-mixed-requires": "error",
    "node/no-new-require": "error",
    "node/no-path-concat": "error",
    "node/no-process-env": "error",
    "node/no-sync": "error",
    "node/no-top-level-await": "error",

    //endregion

    //region ------------- Promises rules -------------

    "promise/always-return": "error",
    "promise/avoid-new": "error",
    "promise/catch-or-return": "error",
    "promise/no-callback-in-promise": "error",
    "promise/no-multiple-resolved": "error",
    "promise/no-nesting": "error",
    "promise/no-new-statics": "error",
    "promise/no-promise-in-callback": "error",
    "promise/no-return-in-finally": "error",
    "promise/no-return-wrap": "error",
    "promise/param-names": "error",
    "promise/prefer-await-to-callbacks": "error",
    "promise/prefer-await-to-then": "error",
    "promise/prefer-catch": "error",
    "promise/spec-only": "error",
    "promise/valid-params": "error",

    //endregion

    /** We prefer named exports */
    "prefer-default-export": "off",

    /**
     * In my opinion, vars, lets and consts, defined separately, make code more
     * readable.
     */
    "one-var": "off",

    /**
     * When these rules are implemented by oxlint, we won't need to enable/disable
     * specific built-ins or syntaxes. It would be done automatically base on the
     * specified version of Node or ECMAScript.
     *
     * [n/no-unsupported-features/es-builtins](https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/no-unsupported-features/es-builtins.md)
     * [n/no-unsupported-features/node-builtins](https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/no-unsupported-features/node-builtins.md)
     * [n/no-unsupported-features/es-syntax](https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/no-unsupported-features/es-syntax.md)
     */
    "oxc/no-rest-spread-properties": "off",
    "oxc/no-async-await": "off",
    "oxc/no-optional-chaining": "off",

    /**
     *  I don't like working with modules, that are globally
     * available. I like everything to be as explicit as possible.
     */
    "import/no-nodejs-modules": "off",

    /**
     * To be able to extend external modules, like process.env.
     * Example:
     *
     * ```ts
     * declare global {
     *   namespace NodeJS {
     *     interface ProcessEnv {
     *       SOME_CUSTOM_ENV_VARIABLE?: "true" | "false";
     *     }
     *   }
     * }
     * ```
     */
    "typescript/no-namespace": ["error", { allowDeclarations: true }],
  },
  overrides: [
    //region ------------- Config files overrides -------------

    {
      files: ["**/*.config.ts"],
      rules: {
        /**
         * All config files that I'm aware of
         * require default export.
         */
        "import/no-default-export": "off",
      },
    },

    //endregion

    //region ------------- Test files overrides -------------

    {
      files: ["**/*.spec.ts"],
      rules: {
        //region ------------- Vitest rules -------------

        "vitest/consistent-each-for": "error",
        "vitest/consistent-vitest-vi": "error",
        "vitest/expect-expect": "error",
        "vitest/hoisted-apis-on-top": "error",
        "vitest/max-expects": "error",
        "vitest/max-nested-describe": "error",
        "vitest/no-alias-methods": "error",
        "vitest/no-commented-out-tests": "error",
        "vitest/no-conditional-expect": "error",
        "vitest/no-conditional-in-test": "error",
        "vitest/no-conditional-tests": "error",
        "vitest/no-disabled-tests": "error",
        "vitest/no-duplicate-hooks": "error",
        "vitest/no-focused-tests": "error",
        "vitest/no-hooks": "error",
        "vitest/no-identical-title": "error",
        "vitest/no-import-node-test": "error",
        "vitest/no-interpolation-in-snapshots": "error",
        "vitest/no-large-snapshots": "error",
        "vitest/no-mocks-import": "error",
        "vitest/no-restricted-matchers": "error",
        "vitest/no-restricted-vi-methods": "error",
        "vitest/no-test-prefixes": "error",
        "vitest/no-test-return-statement": "error",
        "vitest/no-unneeded-async-expect-function": "error",
        "vitest/padding-around-after-all-blocks": "error",
        "vitest/padding-around-test-blocks": "error",
        "vitest/prefer-called-exactly-once-with": "error",
        "vitest/prefer-called-once": "error",
        "vitest/prefer-called-times": "error",
        "vitest/prefer-called-with": "error",
        "vitest/prefer-comparison-matcher": "error",
        "vitest/prefer-describe-function-title": "error",
        "vitest/prefer-each": "error",
        "vitest/prefer-equality-matcher": "error",
        "vitest/prefer-expect-assertions": "error",
        "vitest/prefer-expect-resolves": "error",
        "vitest/prefer-expect-type-of": "error",
        "vitest/prefer-hooks-in-order": "error",
        "vitest/prefer-hooks-on-top": "error",
        "vitest/prefer-import-in-mock": "error",
        "vitest/prefer-importing-vitest-globals": "error",
        "vitest/prefer-lowercase-title": "error",
        "vitest/prefer-mock-promise-shorthand": "error",
        "vitest/prefer-mock-return-shorthand": "error",
        "vitest/prefer-snapshot-hint": "error",
        "vitest/prefer-spy-on": "error",
        "vitest/prefer-strict-boolean-matchers": "error",
        "vitest/prefer-strict-equal": "error",
        "vitest/prefer-to-be": "error",
        "vitest/prefer-to-be-falsy": "error",
        "vitest/prefer-to-be-object": "error",
        "vitest/prefer-to-be-truthy": "error",
        "vitest/prefer-to-contain": "error",
        "vitest/prefer-to-have-been-called-times": "error",
        "vitest/prefer-to-have-length": "error",
        "vitest/prefer-todo": "error",
        "vitest/require-awaited-expect-poll": "error",
        "vitest/require-hook": "error",
        "vitest/require-local-test-context-for-concurrent-snapshots": "error",
        "vitest/require-mock-type-parameters": "error",
        "vitest/require-to-throw-message": "error",
        "vitest/require-top-level-describe": "error",
        "vitest/valid-describe-callback": "error",
        "vitest/valid-expect": "error",
        "vitest/valid-expect-in-promise": "error",
        "vitest/valid-title": "error",
        "vitest/warn-todo": "error",

        //endregion

        //region ------------- Vitest modified rules -------------

        "vitest/consistent-test-filename": [
          "error",
          {
            pattern: ".*\\.spec\\.[t]sx?$",
          },
        ],

        /**
         * I prefer BDD-style tests.
         *
         * Example:
         * ```ts
         * it("should do something", () => {})
         * ```
         */
        "vitest/consistent-test-it": ["error", { fn: "it" }],
        "vitest/no-standalone-expect": [
          "error",
          {
            additionalTestBlockFunctions: ["it", "base"],
          },
        ],

        //endregion

        //region ------------- Vitest disabled rules -------------

        /**
         * We definitely don't need to set timeout for each test. Looks like an
         * overkill.
         */
        "vitest/require-test-timeout": "off",

        /**
         *  I don't like working with modules, that are globally
         * available. I like everything to be as explicit as possible.
         */
        "vitest/no-importing-vitest-globals": "off",

        //endregion

        //region ------------- Non-relevant rules from other plugins -------------

        /**
         * There can be infinite number of `describe` functions
         * nesting.
         */
        "unicorn/max-nested-calls": "off",
      },
    },

    //endregion
  ],
}

export default defineConfig(config)
