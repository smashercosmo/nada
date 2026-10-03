import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import url from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getWorkspaceProjectDescriptors } from "#lib/utils/workspace.js"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nada-workspace-test-"))
  tmpDir = await fs.realpath(tmpDir)
  console.log(tmpDir)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe("workspace test suite", () => {
  it("should return a list of project descriptors including the root one", async () => {
    const template = url.fileURLToPath(
      import.meta
        .resolve("./templates/two-projects-workspace-with-unique-names-and-root-project-named-root"),
    )
    await fs.cp(template, tmpDir, { recursive: true })
    expect(await getWorkspaceProjectDescriptors({ rootDir: tmpDir })).toStrictEqual([
      {
        path: tmpDir,
        label: "root",
        selector: ["-w"],
      },
      {
        path: `${tmpDir}/projects/project-1`,
        label: "@root/project-1",
        selector: ["--filter", "./projects/project-1"],
      },
      {
        path: `${tmpDir}/projects/project-2`,
        label: "@root/project-2",
        selector: ["--filter", "./projects/project-2"],
      },
    ])
  })
  it("should not get confused by similarly named or unnamed projects", async () => {
    const template = url.fileURLToPath(
      import.meta
        .resolve("./templates/three-projects-workspace-with-two-similarly-named-projects-and-one-unnamed-project"),
    )
    await fs.cp(template, tmpDir, { recursive: true })
    expect(await getWorkspaceProjectDescriptors({ rootDir: tmpDir })).toStrictEqual([
      {
        path: tmpDir,
        label: "root",
        selector: ["-w"],
      },
      {
        path: `${tmpDir}/projects/similarly-named-project-1`,
        label: "@root/similarly-named-project (./projects/similarly-named-project-1)",
        selector: ["--filter", "./projects/similarly-named-project-1"],
      },
      {
        path: `${tmpDir}/projects/similarly-named-project-2`,
        label: "@root/similarly-named-project (./projects/similarly-named-project-2)",
        selector: ["--filter", "./projects/similarly-named-project-2"],
      },
      {
        path: `${tmpDir}/projects/unnamed-project`,
        label: "unnamed-project (./projects/unnamed-project)",
        selector: ["--filter", "./projects/unnamed-project"],
      },
    ])
  })
  it("should not get confused when there is a project named similarly to the root project", async () => {
    const template = url.fileURLToPath(
      import.meta
        .resolve("./templates/one-project-workspace-with-project-named-same-as-root-project"),
    )
    await fs.cp(template, tmpDir, { recursive: true })
    expect(await getWorkspaceProjectDescriptors({ rootDir: tmpDir })).toStrictEqual([
      {
        path: tmpDir,
        label: "root",
        selector: ["-w"],
      },
      {
        path: `${tmpDir}/projects/project-named-as-root`,
        label: "root (./projects/project-named-as-root)",
        selector: ["--filter", "./projects/project-named-as-root"],
      },
    ])
  })
  it("should call a callback function in case there are issues with project names", async () => {
    const template = url.fileURLToPath(
      import.meta
        .resolve("./templates/three-projects-workspace-with-two-similarly-named-projects-and-one-unnamed-project"),
    )
    await fs.cp(template, tmpDir, { recursive: true })
    const onNamingIssuesFound = vi.fn()
    await getWorkspaceProjectDescriptors({ rootDir: tmpDir, onNamingIssuesFound })
    expect(onNamingIssuesFound).toHaveBeenCalledTimes(1)
    expect(onNamingIssuesFound).toHaveBeenCalledWith({
      pathsToCheckForNamingIssues: [
        "./projects/similarly-named-project-2",
        "./projects/unnamed-project",
      ],
    })
  })
})
