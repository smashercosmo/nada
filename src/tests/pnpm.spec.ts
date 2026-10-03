import process from "node:process"
import { describe, expect, it } from "vitest"

import { PNPM_VERSION_11 } from "#lib/constants.js"
import { getCurrentPnpmVersion } from "#lib/pnpm.js"
import { TestProject } from "#tests/utils/project.js"

describe("pnpm utils test suite", () => {
  it("should check pnpm version using pnpm executable path from PATH env variable", async () => {
    expect.hasAssertions()
    const PATH = TestProject.addPnpmToPath({ version: PNPM_VERSION_11 })

    const [result] = await getCurrentPnpmVersion({
      env: {
        ...process.env,
        PATH,
      },
    })

    expect(result?.split(".").at(0)).toBe(PNPM_VERSION_11.toString())
  })
})
