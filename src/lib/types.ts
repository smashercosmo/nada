export interface WorkspaceProject {
  /** Package name from package.json */
  name: string;
  /** Absolute path to the project directory */
  path: string;
}

export type DependencyField = "dependencies" | "devDependencies";
