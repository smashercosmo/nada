import path from "node:path"

import { isRecord } from "#lib/utils/guards.js"
import { runPnpm, tailLines } from "#lib/utils/pnpm-process.js"
import { runPnpmJson } from "#lib/utils/pnpm.js"

export interface WorkspaceTarget {
  /** Absolute directory of the project. */
  path: string
  /** Shown in the workspace prompt, e.g. `hello (/projects/hello)` or `nada (root)`. */
  label: string
  /** Flags that make `pnpm add` install into this project. Empty outside a workspace. */
  selector: string[]
}

export interface WorkspaceContext {
  /** Directory every pnpm command runs from. */
  root: string
  isWorkspace: boolean
  /** Root first, then members sorted by path. */
  targets: WorkspaceTarget[]
}

interface ListedProject {
  name?: string
  path: string
}

async function listProjects({ rootDir }: { rootDir: string }): Promise<ListedProject[]> {}

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/")
}

export async function readWorkspaceContext({
  rootDir,
}: {
  rootDir: string
}): Promise<WorkspaceContext> {
  const projects = await runPnpmJson({
    command: "list",
    args: ["--recursive", "--depth", "-1"],
    cwd: rootDir,
  })

  const projects: ListedProject[] = []
  for (const entry of parsed) {
    if (!isRecord(entry) || typeof entry.path !== "string") continue
    projects.push({
      path: path.resolve(entry.path),
      ...(typeof entry.name === "string" ? { name: entry.name } : {}),
    })
  }
  return projects

  const nameCounts = new Map<string, number>()

  for (const project of projects) {
    if (project.name !== undefined) {
      nameCounts.set(project.name, (nameCounts.get(project.name) ?? 0) + 1)
    }
  }

  // Depending on the pnpm version the root may or may not be part of the list,
  // so it is identified by path and everything else is a member.
  const rootProject = projects.find((project) => project.path === rootDir)
  const members = projects
    .filter((project) => project.path !== rootDir)
    .sort((a, b) => a.path.localeCompare(b.path))

  const rootTarget: WorkspaceTarget = {
    path: rootDir,
    label: `${rootProject?.name ?? path.basename(rootDir)} (root)`,
    selector: ["-w"],
  }

  const memberTargets = members.map((project): WorkspaceTarget => {
    const relative = `/${toPosix(path.relative(rootDir, project.path))}`

    // Names are used for filtering when they are unambiguous. Members without a
    // name, or sharing a name with another project, are targeted by path.
    const filter =
      project.name !== undefined && nameCounts.get(project.name) === 1
        ? project.name
        : `.${relative}`

    return {
      path: project.path,
      label: `${project.name ?? path.basename(project.path)} (${relative})`,
      selector: ["--filter", filter],
    }
  })

  return { root: rootDir, isWorkspace: true, targets: [rootTarget, ...memberTargets] }
}
