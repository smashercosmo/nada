import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Confirms the root package.json declares pnpm via the modern
 * `devEngines.packageManager` field. We only check the `name` field:
 * version enforcement (and auto-download) is left entirely to pnpm's own
 * `onFail` handling, so this tool never has its own opinion about which
 * pnpm version counts as "new enough".
 */
export async function assertPnpmProject(cwd: string): Promise<void> {
  const pkgPath = path.join(cwd, "package.json");

  let raw: string;
  try {
    raw = await readFile(pkgPath, "utf8");
  } catch {
    throw new Error(
      `Could not find a package.json at ${pkgPath}. Run this tool from the workspace root.`,
    );
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw);
  } catch {
    throw new Error(`Could not parse ${pkgPath} as JSON.`);
  }

  const devEngines = pkg["devEngines"] as
    | { packageManager?: { name?: string } }
    | undefined;
  const name = devEngines?.packageManager?.name;

  if (name !== "pnpm") {
    throw new Error(
      [
        `Root package.json is missing a "devEngines.packageManager" entry for pnpm.`,
        `Add something like:`,
        `  "devEngines": { "packageManager": { "name": "pnpm", "version": "<your version>", "onFail": "download" } }`,
        `This tool relies on that field instead of checking the pnpm version itself.`,
      ].join("\n"),
    );
  }
}
