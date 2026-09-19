import child_process, {
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import type { WorkspaceProject } from "./types.js";
import {spawn, spawnProcessAndCaptureResult} from "./spawn.ts";
import process from "node:process";

/**
 * The subset of `child_process.spawn` that this module needs.
 *
 * Why inject `spawn` instead of mocking `node:child_process`?
 *
 * - It keeps production code on the normal Node API.
 * - Tests can deterministically decide when a child emits data, `error`, or
 *   `close` without depending on the operating system scheduler.
 * - We do not need a test-framework-specific module-mocking mechanism.
 *
 * The returned value is the real Node `ChildProcess` abstraction. Our tests
 * use a small EventEmitter-based stand-in for most cases and a real
 * ChildProcess for the particularly subtle double-`error` regression test.
 */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface AddOptions {
  /** Packages passed to a single `pnpm add` invocation. */
  packageNames: string[];
  /** Workspace root / current working directory for pnpm. */
  cwd: string;
  /** Package name selected by the user; ignored for a root install. */
  targetName: string | undefined;
  /** Whether the selected project is the workspace root. */
  isRoot: boolean;
  /** The dependency field into which pnpm should save the packages. */
  dependencyField: "dependencies" | "devDependencies";
  /** Named pnpm catalog that should receive the versions. */
  catalogName: string;
}

/**
 * Raised when pnpm successfully starts but reports that dependency build
 * scripts were ignored because they have not been approved.
 *
 * This is deliberately a distinct error type. Callers can tell the difference
 * between an ordinary failed `pnpm` command and the special case where the
 * user needs to approve build scripts and retry.
 */
export class PnpmIgnoredBuildsError extends Error {
  constructor() {
    super("pnpm ignored build scripts for unapproved dependencies");
    this.name = "PnpmIgnoredBuildsError";
  }
}


/**
 * Builds the exact argument vector passed to `pnpm add`.
 *
 * Keeping argument construction separate from process execution is useful
 * both for readability and for testing: we can verify the CLI's meaning
 * without starting pnpm.
 */
function buildArgs(options: AddOptions): string[] {
  const args = ["add", ...options.packageNames];

  if (options.isRoot) {
    // pnpm normally protects a workspace root from accidental dependency
    // installation. `-w` explicitly says that the root is the intended target.
    args.push("-w");
  } else if (options.targetName) {
    // For a non-root workspace project, pnpm's `--filter` selects the package.
    args.push("--filter", options.targetName);
  }

  if (options.dependencyField === "devDependencies") {
    args.push("--save-dev");
  }

  // The tool intentionally always uses a named catalog rather than pnpm's
  // unnamed/default catalog. pnpm creates a new named catalog when necessary.
  args.push("--save-catalog-name", options.catalogName);
  return args;
}

/**
 * Runs the interactive `pnpm add` command.
 *
 * stdin/stdout/stderr are inherited so pnpm remains a genuine interactive
 * child: prompts such as build-script approval can be answered directly in
 * the user's terminal. The function returns pnpm's numeric exit status rather
 * than throwing for an ordinary non-zero exit.
 */
export async function runPnpmAdd(
  options: AddOptions,
  spawnImpl: SpawnFn = child_process.spawn,
): Promise<number> {
  const result = await spawn({
    command: "pnpm",
    args: buildArgs(options),
    cwd: options.cwd,
    spawnImpl,
    stdin: "inherit",
    stdout: "inherit",
  });

  return result.code;
}

/**
 * Runs a pnpm command with stdin inherited but stdout/stderr piped through the
 * parent process.
 *
 * This mode is useful when a caller wants pnpm to remain interactive while
 * still wrapping its output (for example, to prefix each line in a UI). The
 * implementation is intentionally kept in the same lifecycle wrapper as the
 * other modes so signal forwarding, error handling, buffering, and cleanup do
 * not drift between variants.
 */
export async function execPnpmInteractivePipe(
  args: readonly string[],
  cwd: string,
  spawnImpl: SpawnFn = child_process.spawn,
): Promise<number> {
  const result = await spawn({
    command: "pnpm",
    args,
    cwd,
    spawnImpl,
    stdin: "inherit",
    stdout: "pipe",
  });

  return result.code;
}

/**
 * Runs an arbitrary pnpm command with captured stdout/stderr.
 */
export function runPnpmCommandAndCaptureResult(
  args: readonly string[],
  cwd: string = process.cwd(),
  spawnImpl: SpawnFn = child_process.spawn,
): Promise<string> {
  return spawnProcessAndCaptureResult("pnpm", args, cwd, spawnImpl);
}

export function getPnpmVerion() {
  return spawnProcessAndCaptureResult("pnpm", ["--version"]);
}

export function getPackageInfo(pkg: string) {
  return spawnProcessAndCaptureResult("pnpm", ["view", pkg]);
}

/**
 * Lists workspace projects using pnpm itself instead of trying to duplicate
 * pnpm's package-glob/negation resolution in this tool.
 */
export async function getWorkspaceProjects(
  cwd: string,
  spawnImpl: SpawnFn = child_process.spawn,
): Promise<WorkspaceProject[]> {
  const args = ["list", "-r", "--depth", "-1", "--json"] as const;
  const stdout = await spawnProcessAndCaptureResult("pnpm", args, cwd, spawnImpl);

  // JSON parsing intentionally happens after process-success validation. A
  // malformed response therefore becomes a SyntaxError rather than being
  // mistaken for a pnpm process failure.
  const parsed = JSON.parse(stdout) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("pnpm list returned JSON, but the top-level value was not an array.");
  }

  return parsed
  .filter((entry): entry is { name: string; path: string } => {
    if (!entry || typeof entry !== "object") return false;
    const value = entry as Record<string, unknown>;
    return typeof value["name"] === "string" && value["name"].length > 0 && typeof value["path"] === "string";
  })
  .map((entry) => ({ name: entry.name, path: entry.path }));
}

/** Returns a human-readable command string for the confirmation/status UI. */
export function describePnpmAddCommand(options: AddOptions): string {
  return ["pnpm", ...buildArgs(options)].join(" ");
}
