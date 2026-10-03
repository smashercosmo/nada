import process from "node:process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  note: vi.fn(),
  text: vi.fn(),
  select: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock("@clack/prompts", () => ({
  note: mocks.note,
  text: mocks.text,
  select: mocks.select,
  cancel: mocks.cancel,
}))

import {
  createPackageInputState,
  getPackages,
  getPackagesFromCliArgs,
  getPackagesFromUserInput,
  parsePackageInput,
  showRemarkAboutFlags,
  TEXT_EXIT_OPTION,
  TEXT_INPUT_PACKAGES_REQUEST,
  TEXT_REMARK_ABOUT_FLAGS_CONTENT,
  TEXT_REMARK_ABOUT_FLAGS_TITLE,
  TEXT_TRY_AGAIN_OPTION,
  TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
  promptUserToProvidePackagesToInstallOrExit,
} from "./args.js"

const originalArgv = [...process.argv]

afterEach(() => {
  vi.clearAllMocks()
  process.argv = [...originalArgv]
})

describe("parsePackageInput", () => {
  it("removes flags from anywhere in the input", () => {
    const result = parsePackageInput([
      "lodash",
      "--save-dev",
      "axios",
      "--save-exact",
      "react",
    ])

    expect([...result.packages]).toEqual([
      "lodash",
      "axios",
      "react",
    ])
    expect(result.hasFlagsBeenDetected).toBe(true)
  })

  it("removes empty strings", () => {
    const result = parsePackageInput([
      "",
      "lodash",
      "",
      "axios",
    ])

    expect([...result.packages]).toEqual([
      "lodash",
      "axios",
    ])
    expect(result.hasFlagsBeenDetected).toBe(false)
  })

  it("removes duplicate package entries while preserving order", () => {
    const result = parsePackageInput([
      "react",
      "lodash",
      "react",
      "axios",
      "lodash",
    ])

    expect([...result.packages]).toEqual([
      "react",
      "lodash",
      "axios",
    ])
  })

  it("does not report flags when there are none", () => {
    const result = parsePackageInput([
      "react",
      "axios",
    ])

    expect(result.hasFlagsBeenDetected).toBe(false)
  })

  it("keeps different typed forms of the same package", () => {
    const result = parsePackageInput([
      "react",
      "react@18",
      "react@latest",
      "react",
    ])

    expect([...result.packages]).toEqual([
      "react",
      "react@18",
      "react@latest",
    ])
  })
})

describe("getPackagesFromCliArgs", () => {
  it("collects packages after node and the script path", () => {
    process.argv = [
      "/usr/bin/node",
      "/project/bin/nada.js",
      "lodash",
      "axios",
      "react",
    ]

    const result = getPackagesFromCliArgs()

    expect([...result.packages]).toEqual([
      "lodash",
      "axios",
      "react",
    ])
    expect(result.hasFlagsBeenDetected).toBe(false)
  })

  it("filters flags from CLI arguments", () => {
    process.argv = [
      "/usr/bin/node",
      "/project/bin/nada.js",
      "lodash",
      "--save-dev",
      "axios",
      "--save-exact",
      "react",
    ]

    const result = getPackagesFromCliArgs()

    expect([...result.packages]).toEqual([
      "lodash",
      "axios",
      "react",
    ])
    expect(result.hasFlagsBeenDetected).toBe(true)
  })

  it("deduplicates packages from CLI arguments", () => {
    process.argv = [
      "/usr/bin/node",
      "/project/bin/nada.js",
      "react",
      "axios",
      "react",
      "lodash",
      "axios",
    ]

    const result = getPackagesFromCliArgs()

    expect([...result.packages]).toEqual([
      "react",
      "axios",
      "lodash",
    ])
  })

  it("returns no packages when only flags were provided", () => {
    process.argv = [
      "/usr/bin/node",
      "/project/bin/nada.js",
      "--save-dev",
      "--save-exact",
    ]

    const result = getPackagesFromCliArgs()

    expect([...result.packages]).toEqual([])
    expect(result.hasFlagsBeenDetected).toBe(true)
  })
})

describe("getPackagesFromUserInput", () => {
  it("splits packages on whitespace", async () => {
    mocks.text.mockResolvedValue(
      "react react-router axios",
    )

    const result = await getPackagesFromUserInput()

    expect(mocks.text).toHaveBeenCalledWith({
      message: TEXT_INPUT_PACKAGES_REQUEST,
      placeholder: "react react-router",
    })

    expect([...result.packages]).toEqual([
      "react",
      "react-router",
      "axios",
    ])
  })

  it("splits packages on commas", async () => {
    mocks.text.mockResolvedValue(
      "react,axios,lodash",
    )

    const result = await getPackagesFromUserInput()

    expect([...result.packages]).toEqual([
      "react",
      "axios",
      "lodash",
    ])
  })

  it("supports mixed commas and whitespace", async () => {
    mocks.text.mockResolvedValue(
      "react, axios   lodash,react-router",
    )

    const result = await getPackagesFromUserInput()

    expect([...result.packages]).toEqual([
      "react",
      "axios",
      "lodash",
      "react-router",
    ])
  })

  it("filters flags from user input", async () => {
    mocks.text.mockResolvedValue(
      "react --save-dev axios --save-exact lodash",
    )

    const result = await getPackagesFromUserInput()

    expect([...result.packages]).toEqual([
      "react",
      "axios",
      "lodash",
    ])
    expect(result.hasFlagsBeenDetected).toBe(true)
  })

  it("deduplicates packages from user input", async () => {
    mocks.text.mockResolvedValue(
      "react axios react lodash axios",
    )

    const result = await getPackagesFromUserInput()

    expect([...result.packages]).toEqual([
      "react",
      "axios",
      "lodash",
    ])
  })

  it("returns an empty package list when the answer is empty", async () => {
    mocks.text.mockResolvedValue("")

    const result = await getPackagesFromUserInput()

    expect([...result.packages]).toEqual([])
    expect(result.hasFlagsBeenDetected).toBe(false)
  })

  it("treats cancellation as an empty submission", async () => {
    mocks.text.mockResolvedValue(
      Symbol("cancel"),
    )

    const result = await getPackagesFromUserInput()

    expect([...result.packages]).toEqual([])
    expect(result.hasFlagsBeenDetected).toBe(false)
  })
})

describe("showRemarkAboutFlags", () => {
  it("shows the remark when flags are detected", () => {
    const state = createPackageInputState()

    showRemarkAboutFlags(state, true)

    expect(mocks.note).toHaveBeenCalledTimes(1)
    expect(mocks.note).toHaveBeenCalledWith(
      TEXT_REMARK_ABOUT_FLAGS_CONTENT,
      TEXT_REMARK_ABOUT_FLAGS_TITLE,
    )
    expect(state.hasShownFlagRemark).toBe(true)
  })

  it("does not show the remark when no flags were detected", () => {
    const state = createPackageInputState()

    showRemarkAboutFlags(state, false)

    expect(mocks.note).not.toHaveBeenCalled()
    expect(state.hasShownFlagRemark).toBe(false)
  })

  it("shows the remark only once", () => {
    const state = createPackageInputState()

    showRemarkAboutFlags(state, true)
    showRemarkAboutFlags(state, true)
    showRemarkAboutFlags(state, true)

    expect(mocks.note).toHaveBeenCalledTimes(1)
    expect(state.hasShownFlagRemark).toBe(true)
  })

  it("does not show the remark again after a later flag is detected", () => {
    const state = createPackageInputState()

    showRemarkAboutFlags(state, true)
    showRemarkAboutFlags(state, false)
    showRemarkAboutFlags(state, true)

    expect(mocks.note).toHaveBeenCalledTimes(1)
  })
})

describe("promptUserToProvidePackagesToInstallOrExit", () => {
  it("does nothing when the user chooses Try again", async () => {
    mocks.select.mockResolvedValue(
      TEXT_TRY_AGAIN_OPTION,
    )

    await promptUserToProvidePackagesToInstallOrExit()

    expect(mocks.select).toHaveBeenCalledWith({
      message: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      options: [
        { value: TEXT_TRY_AGAIN_OPTION },
        { value: TEXT_EXIT_OPTION },
      ],
    })

    expect(mocks.cancel).not.toHaveBeenCalled()
  })

  it("exits when the user chooses Exit", async () => {
    mocks.select.mockResolvedValue(
      TEXT_EXIT_OPTION,
    )

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {
        throw new Error("PROCESS_EXIT")
      }) as never)

    await expect(
      promptUserToProvidePackagesToInstallOrExit(),
    ).rejects.toThrow("PROCESS_EXIT")

    expect(mocks.cancel).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledTimes(1)

    exitSpy.mockRestore()
  })
})

describe("getPackages", () => {
  it("returns CLI packages without prompting for interactive input", async () => {
    process.argv = [
      "/usr/bin/node",
      "/project/bin/nada.js",
      "lodash",
      "axios",
    ]

    const result = await getPackages()

    expect([...result]).toEqual([
      "lodash",
      "axios",
    ])

    expect(mocks.text).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it("filters CLI flags and returns the remaining packages", async () => {
    process.argv = [
      "/usr/bin/node",
      "/project/bin/nada.js",
      "lodash",
      "--save-dev",
      "axios",
    ]

    const result = await getPackages()

    expect([...result]).toEqual([
      "lodash",
      "axios",
    ])

    expect(mocks.note).toHaveBeenCalledTimes(1)
  })

  it("shows the flag remark only once across CLI and interactive input", async () => {
    process.argv = [
      "/usr/bin/node",
      "/project/bin/nada.js",
      "--save-dev",
    ]

    mocks.text.mockResolvedValue(
      "lodash --save-exact",
    )

    const state = createPackageInputState()

    const result = await getPackages(state)

    expect([...result]).toEqual([
      "lodash",
    ])

    expect(mocks.note).toHaveBeenCalledTimes(1)
  })

  it("prompts again after an empty initial submission", async () => {
    process.argv = [
      "/usr/bin/node",
      "/project/bin/nada.js",
    ]

    mocks.text
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("react")

    mocks.select.mockResolvedValue(
      TEXT_TRY_AGAIN_OPTION,
    )

    const result = await getPackages()

    expect([...result]).toEqual([
      "react",
    ])

    expect(mocks.text).toHaveBeenCalledTimes(2)
    expect(mocks.select).toHaveBeenCalledTimes(1)
  })

  it("treats Escape at the initial prompt as empty input", async () => {
    process.argv = [
      "/usr/bin/node",
      "/project/bin/nada.js",
    ]

    mocks.text
      .mockResolvedValueOnce(Symbol("cancel"))
      .mockResolvedValueOnce("react")

    mocks.select.mockResolvedValue(
      TEXT_TRY_AGAIN_OPTION,
    )

    const result = await getPackages()

    expect([...result]).toEqual([
      "react",
    ])

    expect(mocks.text).toHaveBeenCalledTimes(2)
    expect(mocks.select).toHaveBeenCalledTimes(1)
  })

  it("does not show the flag remark more than once across repeated attempts", async () => {
    process.argv = [
      "/usr/bin/node",
      "/project/bin/nada.js",
    ]

    mocks.text
      .mockResolvedValueOnce("--save-dev")
      .mockResolvedValueOnce("react --save-exact")

    mocks.select
      .mockResolvedValueOnce(TEXT_TRY_AGAIN_OPTION)

    const result = await getPackages()

    expect([...result]).toEqual([
      "react",
    ])

    expect(mocks.note).toHaveBeenCalledTimes(1)
  })

  it("returns package names exactly as typed", async () => {
    process.argv = [
      "/usr/bin/node",
      "/project/bin/nada.js",
    ]

    mocks.text.mockResolvedValue(
      "react@18 axios@latest",
    )

    const result = await getPackages()

    expect([...result]).toEqual([
      "react@18",
      "axios@latest",
    ])
  })
})
