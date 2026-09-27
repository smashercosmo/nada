import { describe, it as base } from "vitest"

import {
  TEXT_INTRO,
  TEXT_CHECKING_IF_PNPM_IS_AVAILABLE,
  TEXT_PNPM_CHECK_ERROR,
  PNPM_VERSION_11,
  TEXT_PNPM_CHECK_SUCCESS,
  TEXT_EXITING, PNPM_VERSION_10, getPnpmVersionIsNotSupportedMessage,
} from '#lib/utils/constants.js'
import { expectStepTextToBeInConsole, expectStepsToComeInOrder } from "#tests/utils/matchers.js"
import { setup } from "#tests/utils/setup.js"

const it = setup(base)

describe("nada CLI test suite", () => {
  it("should start checking if pnpm is available", async ({ project }) => {
    const result = await project.run()
    await expectStepTextToBeInConsole({ result, stepText: TEXT_CHECKING_IF_PNPM_IS_AVAILABLE })
    expectStepsToComeInOrder({
      result,
      steps: [TEXT_INTRO, TEXT_CHECKING_IF_PNPM_IS_AVAILABLE],
    })
  })

  it("should fail pnpm availability check", async ({ project }) => {
    const result = await project.run()
    await expectStepTextToBeInConsole({ result, stepText: TEXT_EXITING })
    expectStepsToComeInOrder({
      result,
      steps: [TEXT_INTRO, TEXT_CHECKING_IF_PNPM_IS_AVAILABLE, TEXT_PNPM_CHECK_ERROR, TEXT_EXITING],
    })
  })

  it("should succeed with pnpm availability check", async ({ project }) => {
    const result = await project.run({ pnpm: PNPM_VERSION_11 })
    await expectStepTextToBeInConsole({ result, stepText: TEXT_PNPM_CHECK_SUCCESS })
    expectStepsToComeInOrder({
      result,
      steps: [TEXT_INTRO, TEXT_CHECKING_IF_PNPM_IS_AVAILABLE, TEXT_PNPM_CHECK_SUCCESS],
    })
  })

  it("should succeed with pnpm availability check", async ({ project }) => {
    const result = await project.run({ pnpm: PNPM_VERSION_10 })
    await expectStepTextToBeInConsole({ result, stepText: TEXT_PNPM_CHECK_SUCCESS })
    expectStepsToComeInOrder({
      result,
      steps: [TEXT_INTRO, TEXT_CHECKING_IF_PNPM_IS_AVAILABLE, TEXT_PNPM_CHECK_SUCCESS],
    })
  })

  it("should fail id current pnpm version is not supported", async ({ project }) => {
    const result = await project.run({ pnpm: PNPM_VERSION_10 })
    await expectStepTextToBeInConsole({ result, stepText: getPnpmVersionIsNotSupportedMessage({
        supportedPnpmMajorVersion: "11",
        currentPnpmVersion: project.getPackageJson().engines.pnpm,
      }) })
    expectStepsToComeInOrder({
      result,
      steps: [TEXT_INTRO, TEXT_CHECKING_IF_PNPM_IS_AVAILABLE, TEXT_PNPM_CHECK_SUCCESS],
    })
  })
})
