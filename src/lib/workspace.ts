
import path from "node:path"

import { runPnpmJson } from "#lib/pnpm.js"

export async function getWorkspaceProjectDescriptors({
  rootDir,
  onNamingIssuesFound,
}: {
  rootDir: string
  onNamingIssuesFound?: (args: { pathsToCheckForNamingIssues: string[] }) => void
}) {
  const projects = await runPnpmJson({
    command: "list",
    args: ["--recursive", "--depth", "-1"],
    cwd: rootDir,
  }) ?? [];

  const names = new Set<string>([])
  const duplicates = new Map<string, string>()
  const unnamed = new Set<string>()

  for (const project of projects) {
    if (project.name !== undefined && project.name !== "") {
      if (names.has(project.name)) {
        duplicates.set(project.name, getRelativePath({ project, rootDir }))
      } else {
        names.add(project.name)
      }
    } else {
      unnamed.add(getRelativePath({ project, rootDir }))
    }
  }

  if (duplicates.size > 0) {
    onNamingIssuesFound?.({ pathsToCheckForNamingIssues: [...duplicates.values(), ...unnamed] })
  }

  function getProjectName({
    project,
    rootDir,
  }: {
    project: { name?: string; path: string }
    rootDir: string
  }) {
    return project.name !== undefined && project.name !== ""
      ? project.name
      : project.path === rootDir
        ? "root"
        : path.basename(project.path)
  }

  function getRelativePath({ project, rootDir }: { project: { path: string }; rootDir: string }) {
    return `.${path.sep}${path.relative(rootDir, project.path)}`
  }

  return projects
    .toSorted((a, b) => {
      if (a.path === rootDir) return 1
      return a.path.localeCompare(b.path)
    })
    .map((project) => {
      if (project.path === rootDir) {
        return {
          path: rootDir,
          label: [getProjectName({ project, rootDir }), ...(project.name ? [] : ["(./)"])].join(
            " ",
          ),
          selector: ["-w"],
        } as const
      }

      const relative = getRelativePath({ project, rootDir })

      /**
       * We always use a project path for filtering, as project names
       * are not guaranteed to be unique.
       *
       * Example:
       *  [
       *   {
       *     "name": "@root",
       *     "path": "/Users/user/projects/test",
       *   },
       *   {
       *     "name": "@root/package",
       *     "path": "/Users/user/projects/test/projects/project-2",
       *   },
       *   {
       *     "name": "@root/package",
       *     "path": "/Users/user/projects/test/projects/project-1",
       *   }
       * ]
       */
      return {
        path: project.path,
        label: [
          getProjectName({ project, rootDir }),
          ...(!project.name || duplicates.has(project.name) ? [`(${relative})`] : []),
        ].join(" "),
        selector: ["--filter", relative],
      } as const
    })
}
