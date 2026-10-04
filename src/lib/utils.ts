import fs from 'node:fs';
import path from 'node:path';

/**
 * Traverses up the directory tree to find the project root.
 *
 * @param startDir - The absolute path of the directory to start searching from.
 * @returns The absolute path to the project root.
 */
export function findProjectRoot(startDir: string): string {
  let currentDir: string = path.resolve(startDir);

  while (true) {
    // 1. Check for unpublishable root markers
    const isRoot: boolean =
      fs.existsSync(path.join(currentDir, '.git')) ||
      fs.existsSync(path.join(currentDir, 'pnpm-lock.yaml')) ||
      fs.existsSync(path.join(currentDir, 'package-lock.json')) ||
      fs.existsSync(path.join(currentDir, 'yarn.lock'));

    if (isRoot) {
      return currentDir;
    }

    // 2. Move up one directory level
    const parentDir: string = path.dirname(currentDir);

    // 3. Stop if we reach the root of the file system (e.g., '/' or 'C:\')
    if (parentDir === currentDir) {
      throw new Error("Project root not found. No .git or lockfiles detected.");
    }

    currentDir = parentDir;
  }
}

import { EXIT_CODE_GENERAL_FAILURE } from "#lib/constants.js"

const TEXT_INSTALLATION_PROCESS_TERMINATED_BY_THE_USER =
  "Installation process has been terminated by the user."

/**
 * Unwraps a clack prompt result. If the user canceled (Ctrl+C), the CLI exits
 * right away with a non-zero code. Nothing is installed before all prompts
 * have been answered, so cancelling never leaves a partial installation behind.
 */
function unwrap<T extends unknown>(value: T | typeof CANCEL_SYMBOL) {
  if (isCancel(value)) {
    cancel(TEXT_INSTALLATION_PROCESS_TERMINATED_BY_THE_USER)
    process.exit(EXIT_CODE_GENERAL_FAILURE)
  }
  return value
}

export {
  TEXT_INSTALLATION_PROCESS_TERMINATED_BY_THE_USER,
  unwrap,
}
