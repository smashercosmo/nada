import { describe, expect, it, beforeEach } from "vitest"

import type { ReadonlyDeep } from "#lib/utils/types.js"
import type { EngineDependency, PackageJson } from "#lib/utils/version.js"

import { isCliPnpmVersionSupported } from "#lib/utils/version.js"

function packageJson(value: ReadonlyDeep<PackageJson>): PackageJson {
  return value
}

function pnpm(version?: string): EngineDependency {
  return {
    name: "pnpm",
    ...(version === undefined ? {} : { version }),
  }
}

function npm(version?: string): EngineDependency {
  return {
    name: "npm",
    ...(version === undefined ? {} : { version }),
  }
}

type PackageManagerSpecifiedAs = 'field' | 'object'  | 'both'

function createPackageJsonPackageManager({ name = "pmpm", version, type = 'object' }: { name?: string, version: string, type?: PackageManagerSpecifiedAs }) {
  return {
    ...(type === 'field' || type === "both" ? { packageManager: `${name}@${version}`} : undefined),
    ...(type === "object" || type === "both" ? {
      devEngines: {
        packageManager: {
          name: name ?? "pmpm",
          version,
        },
      }
    } : undefined),
  } satisfies PackageJson
}

describe("is CLI pnpm version supported", () => {
  describe("is should be checking `devEngines` object first, them `packageManagerField` and finally  specified pnpm target version in", () => {
    it("should support package manager version that's freater or equal cli's version (with any modifier)", () => {
      const modifiers = ["", "^", "~"]

      const cliPackageJson = createPackageJsonPackageManager({ version: "^10.0.0" })
      const targetPackageJson = createPackageJsonPackageManager({ version: "^10.5.0" })
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson,
          targetPackageJson,
        }),
      ).toBe(true)
    })


    /*it.each([
      {
        description: "supports an overlapping object-form range",
        cliPnpmVersion: "^10.0.0",
        target: {
          engines: { pnpm: "^10.5.0" },
        },
        expected: true,
      },
      {
        description: "rejects a non-overlapping object-form range",
        cliPnpmVersion: "^10.0.0",
        target: {
          engines: { pnpm: "^11.0.0" },
        },
        expected: false,
      },
      {
        description: "supports an exact version",
        cliPnpmVersion: "10.5.3",
        target: {
          engines: { pnpm: "^10.0.0" },
        },
        expected: true,
      },
      {
        description: "rejects an exact version outside the range",
        cliPnpmVersion: "11.0.0",
        target: {
          engines: { pnpm: "^10.0.0" },
        },
        expected: false,
      },
    ])("$description", ({ cliPnpmVersion, target, expected }) => {
      expect.hasAssertions()
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm(cliPnpmVersion),
            },
          }),
          targetPackageJson: packageJson(target),
        }),
      ).toBe(expected)
    })

    it.each([
      {
        description: "supports an array-form entry",
        cliPackageManager: [pnpm("^10.0.0")],
        target: {
          engines: { pnpm: "^10.5.0" },
        },
        expected: true,
      },
      {
        description: "ignores other package managers",
        cliPackageManager: [npm("^20.0.0"), pnpm("^10.0.0")],
        target: {
          engines: { pnpm: "^10.5.0" },
        },
        expected: true,
      },
      {
        description: "returns undefined without a pnpm entry",
        cliPackageManager: [npm("^20.0.0")],
        target: {
          engines: { pnpm: "^10.0.0" },
        },
        expected: undefined,
      },
      {
        description: "returns undefined for an unversioned pnpm entry",
        cliPackageManager: [pnpm()],
        target: {
          engines: { pnpm: "^10.0.0" },
        },
        expected: undefined,
      },
      {
        description: "ignores unversioned pnpm entries",
        cliPackageManager: [pnpm(), pnpm("^10.0.0")],
        target: {
          engines: { pnpm: "^10.5.0" },
        },
        expected: true,
      },
    ])("$description", ({ cliPackageManager, target, expected }) => {
      expect.hasAssertions()
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: cliPackageManager,
            },
          }),
          targetPackageJson: packageJson(target),
        }),
      ).toBe(expected)
    })

    it.each([
      {
        description: "supports overlapping constraints",
        cliPackageManager: [pnpm("^10.0.0"), pnpm("~10.5.0")],
        targetVersion: "10.5.3",
        expected: true,
      },
      {
        description: "rejects incompatible constraints",
        cliPackageManager: [pnpm("^10.0.0"), pnpm("^11.0.0")],
        targetVersion: "10.5.3",
        expected: false,
      },
      {
        description: "ignores constraints for other package managers",
        cliPackageManager: [npm("^20.0.0"), pnpm("^10.0.0")],
        targetVersion: "^10.5.0",
        expected: true,
      },
    ])("$description", ({ cliPackageManager, targetVersion, expected }) => {
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: cliPackageManager,
            },
          }),
          targetPackageJson: packageJson({
            engines: {
              pnpm: targetVersion,
            },
          }),
        }),
      ).toBe(expected)
    })
  })

  describe("semver ranges", () => {
    it.each([
      {
        cliVersion: "^10.0.0",
        targetVersion: "^10.5.0",
        expected: true,
      },
      {
        cliVersion: "^10.0.0",
        targetVersion: "^11.0.0",
        expected: false,
      },
      {
        cliVersion: "~10.2.0",
        targetVersion: "~10.2.5",
        expected: true,
      },
      {
        cliVersion: "~10.2.0",
        targetVersion: "~10.3.0",
        expected: false,
      },
      {
        cliVersion: "10.x",
        targetVersion: "10.5.x",
        expected: true,
      },
      {
        cliVersion: "10.x",
        targetVersion: "11.x",
        expected: false,
      },
      {
        cliVersion: ">=10 <11",
        targetVersion: "^10.5.0",
        expected: true,
      },
      {
        cliVersion: ">=10 <11",
        targetVersion: "^11.0.0",
        expected: false,
      },
      {
        cliVersion: "^10.0.0 || ^11.0.0",
        targetVersion: "~10.5.0",
        expected: true,
      },
      {
        cliVersion: "^10.0.0 || ^11.0.0",
        targetVersion: "~11.5.0",
        expected: true,
      },
      {
        cliVersion: "^10.0.0 || ^11.0.0",
        targetVersion: "^12.0.0",
        expected: false,
      },
      {
        cliVersion: "10.0.0 - 10.9.0",
        targetVersion: "^10.5.0",
        expected: true,
      },
      {
        cliVersion: "10.0.0 - 10.4.0",
        targetVersion: "^10.5.0",
        expected: false,
      },
      {
        cliVersion: "^0.3.0",
        targetVersion: "~0.3.5",
        expected: true,
      },
      {
        cliVersion: "^0.3.0",
        targetVersion: "^0.4.0",
        expected: false,
      },
    ])(
      "$cliVersion and $targetVersion have expected compatibility",
      ({ cliVersion, targetVersion, expected }) => {
        expect(
          isCliPnpmVersionSupported({
            cliPackageJson: packageJson({
              devEngines: {
                packageManager: pnpm(cliVersion),
              },
            }),
            targetPackageJson: packageJson({
              engines: {
                pnpm: targetVersion,
              },
            }),
          }),
        ).toBe(expected)
      },
    )
  })

  describe("target version precedence", () => {
    it("prefers development engines over packageManager", () => {
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm("^10.0.0"),
            },
          }),
          targetPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm("^10.5.0"),
            },
            packageManager: "pnpm@^11.0.0",
          }),
        }),
      ).toBe(true)
    })

    it("prefers development engines over engines", () => {
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm("^10.0.0"),
            },
          }),
          targetPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm("^10.5.0"),
            },
            engines: {
              pnpm: "^11.0.0",
            },
          }),
        }),
      ).toBe(true)
    })

    it("prefers packageManager over engines", () => {
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm("^10.0.0"),
            },
          }),
          targetPackageJson: packageJson({
            packageManager: "pnpm@^10.5.0",
            engines: {
              pnpm: "^11.0.0",
            },
          }),
        }),
      ).toBe(true)
    })

    it("falls back from development engines to packageManager", () => {
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm(),
            },
          }),
          targetPackageJson: packageJson({
            packageManager: "pnpm@^10.5.0",
          }),
        }),
      ).toBe(true)
    })

    it("falls back from packageManager to engines", () => {
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm("^10.0.0"),
            },
          }),
          targetPackageJson: packageJson({
            packageManager: "npm@20.0.0",
            engines: {
              pnpm: "^10.5.0",
            },
          }),
        }),
      ).toBe(true)
    })

    it("returns undefined when the target has no pnpm version", () => {
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm("^10.0.0"),
            },
          }),
          targetPackageJson: packageJson({
            packageManager: "npm@20.0.0",
          }),
        }),
      ).toBeUndefined()
    })
  })

  describe("target packageManager", () => {
    it.each([
      {
        packageManager: "pnpm@10.0.0",
        expected: true,
      },
      {
        packageManager: "pnpm@^10.0.0",
        expected: true,
      },
      {
        packageManager: "pnpm@~10.0.0",
        expected: true,
      },
      {
        packageManager: "pnpm@10.x",
        expected: true,
      },
      {
        packageManager: "npm@10.0.0",
        expected: undefined,
      },
      {
        packageManager: "pnpm",
        expected: undefined,
      },
      {
        packageManager: "pnpmish@10.0.0",
        expected: undefined,
      },
    ])("handles $packageManager", ({ packageManager, expected }) => {
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm("^10.0.0"),
            },
          }),
          targetPackageJson: packageJson({
            packageManager,
          }),
        }),
      ).toBe(expected)
    })
  })

  describe("other fields", () => {
    it.each(["ignore", "warn", "error", "download"] as const)(
      "ignores onFail value %s",
      (onFail) => {
        expect(
          isCliPnpmVersionSupported({
            cliPackageJson: packageJson({
              devEngines: {
                packageManager: pnpm("^10.0.0", {
                  onFail,
                }),
              },
            }),
            targetPackageJson: packageJson({
              engines: {
                pnpm: "^10.5.0",
              },
            }),
          }),
        ).toBe(true)
      },
    )

    it("uses the target development engines object form", () => {
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm("^10.0.0"),
            },
          }),
          targetPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm("^10.5.0"),
            },
          }),
        }),
      ).toBe(true)
    })

    it("uses the target development engines array form", () => {
      expect(
        isCliPnpmVersionSupported({
          cliPackageJson: packageJson({
            devEngines: {
              packageManager: pnpm("^10.0.0"),
            },
          }),
          targetPackageJson: packageJson({
            devEngines: {
              packageManager: [npm("^20.0.0"), pnpm("^10.5.0")],
            },
          }),
        }),
      ).toBe(true)
    })*/
  })
})
