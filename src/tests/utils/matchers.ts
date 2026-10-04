// oxlint-disable-next-line import/no-unassigned-import
import "cli-testing-library/vitest"
import type { RenderResult } from "cli-testing-library"

import { getDefaultNormalizer } from "cli-testing-library"
import os from "node:os"
import { expect } from "vitest"

import type { ReadonlyDeep } from "#lib/types.js"

const defaultNormalizer = getDefaultNormalizer({
  stripAnsi: true,
  collapseWhitespace: true,
  trim: true,
})

function normalize({ text }: Readonly<{ text: string }>) {
  return defaultNormalizer(text)
    .split(os.EOL)
    .map((item) => item.trim())
    .join(" ")
    .trim()
}

function expectStepsToComeInOrder(
  options: ReadonlyDeep<{
    result: RenderResult
    steps: string[]
  }>,
) {
  const { result, steps } = options
  expect(normalize({ text: result.getStdallStr() })).toBe(normalize({ text: steps.join(os.EOL) }))
}

async function expectStepTextToBeInConsole({
  result,
  stepText,
}: ReadonlyDeep<{
  result: RenderResult
  stepText: string
}>): ReturnType<typeof result.findByText> {
  const instance = await result.findByText(normalize({ text: stepText }))
  expect(instance).toBeInTheConsole()
  return instance
}

async function expectErrorTextToBeInConsole({
  result,
  errorText,
}: ReadonlyDeep<{
  result: RenderResult
  errorText: string
}>): ReturnType<typeof result.findByError> {
  const instance = await result.findByError(normalize({ text: errorText }))
  expect(instance).toBeInTheConsole()
  return instance
}

export { expectStepTextToBeInConsole, expectStepsToComeInOrder, expectErrorTextToBeInConsole }
