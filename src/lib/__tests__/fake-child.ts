import { EventEmitter } from 'node:events'

/**
 * A minimal stand-in for node:child_process's ChildProcess, exposing just
 * the surface pnpm.ts actually touches (stdout/stderr streams, `on`,
 * `kill`). Because runCapture/runPnpmAdd accept spawn as an injectable
 * parameter, tests can hand in one of these instead of reaching for a
 * module-mocking framework.
 */
export class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killCalls: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals): boolean {
    this.killCalls.push(signal);
    return true;
  }

  emitStdout(chunk: string): void {
    this.stdout.emit("data", Buffer.from(chunk));
  }

  emitStderr(chunk: string): void {
    this.stderr.emit("data", Buffer.from(chunk));
  }

  closeWith(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.emit("close", code, signal);
  }
}

export interface RecordedCall {
  command: string;
  args: string[];
  options: Record<string, unknown>;
}

/**
 * Builds a fake `spawn` that hands back a fresh FakeChildProcess per call
 * (via childFactory) and records every invocation for assertions.
 */
export function createFakeSpawn(childFactory: () => FakeChildProcess) {
  const calls: RecordedCall[] = [];
  const spawnImpl = (
    command: string,
    args: string[],
    options: Record<string, unknown>,
  ) => {
    const child = childFactory();
    calls.push({ command, args, options });
    return child as unknown as import("node:child_process").ChildProcess;
  };
  return { spawnImpl, calls };
}
