import type { TestAPI } from "vitest"

import type { ReadonlyDeep } from "#lib/types.js"

import { TestProject } from "#tests/utils/project.js"

function setup(it: ReadonlyDeep<Pick<TestAPI, "extend" | "afterEach" | "beforeEach">>) {
  const extended = it.extend<{
    project: TestProject
  }>({
    async project({ task }, use) {
      const project = new TestProject({
        name: task.name.replaceAll(/[^0-9a-z]/giv, "-").toLowerCase(),
        programFilePath: "#src/index.js",
      })
      await use(project)
    },
  })

  extended.beforeEach(async ({ project }) => {
    await project.create()
  })

  extended.afterEach(async ({ project }) => {
    await project.cleanup()
  })

  return extended
}

export { setup }
