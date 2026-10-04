import os from "node:os"
import { describe, expect, it as base } from "vitest"

import {
  cleanUpPackagesList,
  TEXT_INPUT_PACKAGES_REQUEST,
  TEXT_NOTE_ABOUT_FLAGS_CONTENT,
  TEXT_NOTE_ABOUT_FLAGS_TITLE,
  TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
  TEXT_TRY_AGAIN_OPTION,
  TEXT_EXIT_OPTION,
} from "#lib/args.js"
import { expectStepTextToBeInConsole } from "#tests/utils/matchers.js"
import { setup } from "#tests/utils/setup.js"

const it = setup(base)

describe("args test suite", () => {
  describe("cleanup packages list", () => {
    it("should remove flags, duplicates", () => {
      const result = cleanUpPackagesList([
        "lodash",
        "--save-dev",
        "axios",
        "--save-exact", // non-relevant flag
        "react", // duplicate
        "", // falsy value
      ])

      expect([...result.packages]).toEqual(["lodash", "axios", "react"])
      expect(result.hasDetectedFlags).toBe(true)
    })

    it("should report whether flags were detected independently of the result", () => {
      const result = cleanUpPackagesList(["--save-dev", "--save-exact"])

      expect([...result.packages]).toEqual([])
      expect(result.hasDetectedFlags).toBe(true)
    })

    it("should report no flags when none were provided", () => {
      const result = cleanUpPackagesList(["lodash", "axios", "react"])

      expect(result.hasDetectedFlags).toBe(false)
    })
  })

  describe("CLI input", () => {
    it("should skip the package prompt when packages are provided as arguments", async ({
      project,
    }) => {
      const result = await project.run({
        args: ["lodash", "axios", "react"],
      })

      expect(result.queryByText(TEXT_INPUT_PACKAGES_REQUEST)).not.toBeInTheConsole()
    })

    it.only("should ignore CLI flags", async ({ project }) => {
      const result = await project.run({
        args: ["--save-dev", "--save-exact"],
      })


      const instance = await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      console.log(111, instance.getStdallStr())
      console.log(222, instance.stdoutArr.map(item => item.contents.toString()))

      /*await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })*/

      //expect(result.getStdallStr()).toContain(TEXT_REMARK_ABOUT_FLAGS_TITLE)

      // Exit the select so the test finishes cleanly.
      //result.userEvent.keyboard("[ArrowDown][Enter]")
    })

    it("should show the flag remark when CLI flags are provided", async ({ project }) => {
      const result = await project.run({
        args: ["--save-dev"],
      })

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_NOTE_ABOUT_FLAGS_CONTENT,
      })
    })
  })

  /*

  describe("interactive input", () => {
    it("should show the package input prompt when no CLI packages are provided", async ({
                                                                                          project,
                                                                                        }) => {
      const result = await project.run()

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      // Leave the flow through the explicit empty-input handling.
      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })

      // Select "Exit".
      result.userEvent.keyboard("[ArrowDown][Enter]")
    })

    it("should treat an empty initial answer as no package input", async ({
                                                                            project,
                                                                          }) => {
      const result = await project.run()

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })

      // "Try again" is selected by default.
      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      // Exit the next select so that the test terminates.
      result.userEvent.keyboard("[Enter]")
      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })
      result.userEvent.keyboard("[ArrowDown][Enter]")
    })

    it("should treat Escape at the initial prompt like an empty answer", async ({
                                                                                  project,
                                                                                }) => {
      const result = await project.run()

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      result.userEvent.keyboard("[Escape]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })

      result.userEvent.keyboard("[ArrowDown][Enter]")
    })

    it("should ignore flags entered in the interactive prompt", async ({
                                                                         project,
                                                                       }) => {
      const result = await project.run()

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      result.userEvent.keyboard(
        "--save-dev --save-exact",
      )
      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_REMARK_ABOUT_FLAGS_CONTENT,
      })

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })

      result.userEvent.keyboard("[ArrowDown][Enter]")
    })

    it("should show the flag remark only once", async ({
                                                         project,
                                                       }) => {
      const result = await project.run()

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      // First input contains a flag.
      result.userEvent.keyboard("--save-dev")
      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_REMARK_ABOUT_FLAGS_CONTENT,
      })

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })

      // Try again.
      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      // Second input contains another flag.
      result.userEvent.keyboard("--save-exact")
      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })

      const output = result.getStdallStr()

      /!**
       * The explanatory note belongs to the whole package-input flow,
       * not to an individual submission.
       *!/
      expect(
        output.split(TEXT_REMARK_ABOUT_FLAGS_TITLE).length - 1,
      ).toBe(1)

      result.userEvent.keyboard("[ArrowDown][Enter]")
    })

    it("should not show the flag remark again after a flag appeared in CLI arguments", async ({
                                                                                                project,
                                                                                              }) => {
      const result = await project.run({
        args: ["--save-dev"],
      })

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_REMARK_ABOUT_FLAGS_CONTENT,
      })

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })

      // Try again.
      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      // Another flag later in the same overall flow.
      result.userEvent.keyboard("--save-exact")
      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })

      const output = result.getStdallStr()

      expect(
        output.split(TEXT_REMARK_ABOUT_FLAGS_TITLE).length - 1,
      ).toBe(1)

      result.userEvent.keyboard("[ArrowDown][Enter]")
    })
  })

  describe("try again or exit", () => {
    it("should offer Try again after an empty submission", async ({
                                                                    project,
                                                                  }) => {
      const result = await project.run()

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })

      // "Try again" is the first/default option.
      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      // Exit eventually.
      result.userEvent.keyboard("[Escape]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })

      result.userEvent.keyboard("[ArrowDown][Enter]")
    })

    it("should exit when Exit is selected", async ({ project }) => {
      const result = await project.run()

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_INPUT_PACKAGES_REQUEST,
      })

      result.userEvent.keyboard("[Enter]")

      await expectStepTextToBeInConsole({
        result,
        stepText: TEXT_TRY_AGAIN_OR_EXIT_QUESTION,
      })

      result.userEvent.keyboard("[ArrowDown][Enter]")

      await result.waitForExit()
    })
  })*/
})
