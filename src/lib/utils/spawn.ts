import type { ChildProcess } from "node:child_process"

import child_process from "node:child_process"
import process from "node:process"
import { StringDecoder } from "node:string_decoder"

import type { SpawnFn } from "./pnpm.ts"

interface Options {
  command: string
  args: readonly string[]
  spawnImpl: SpawnFn
  stdin: "ignore" | "inherit"
  stdout: "pipe" | "inherit"
  cwd?: string | undefined
  env?: NodeJS.ProcessEnv | undefined
}

interface Result {
  /** Normalized exit status. A signal termination becomes `1`. */
  code: number
  /** The original signal, if Node reported signal termination. */
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

/**
 * Shared lifecycle implementation for capture and interactive process modes.
 *
 * There are several independent things to get right here:
 *
 * 1. `spawn()` can throw synchronously. That is different from a later
 *    ChildProcess `error` event, so it needs its own try/catch.
 * 2. A ChildProcess can emit both `error` and `close`. The Promise must settle
 *    exactly once, and the first meaningful failure must not be overwritten by
 *    a later `close` event.
 * 3. We deliberately keep the `error` listener installed after the Promise is
 *    settled. Removing it can turn a later `error` event into an unhandled
 *    EventEmitter error. This is why `on("error")` + `settled` is used instead
 *    of `once("error")`.
 * 4. SIGINT/SIGTERM handlers must be removed on every termination path so a
 *    long-running CLI invocation does not accumulate listeners.
 * 5. Stream chunks are arbitrary byte boundaries. A UTF-8 character can be
 *    split across chunks, so interactive output uses `StringDecoder` rather
 *    than calling `chunk.toString("utf8")` independently for every chunk.
 * 6. We retain the raw chunks separately. That makes the final captured text
 *    independent of how the stream happened to be chunked and avoids mixing
 *    display formatting with diagnostic data.
 */
async function spawn(options: Options): Promise<Result> {
  return new Promise((resolve, reject) => {
    const { command, args, cwd, spawnImpl, stdin, stdout, env } = options

    let child: ChildProcess

    // `spawn()` normally reports operational failures asynchronously through
    // The ChildProcess `error` event. However, an injected implementation (and
    // Some argument/configuration failures) can throw before a ChildProcess is
    // Returned. There is no child to attach an event listener to in that case.
    try {
      child = spawnImpl(command, args, {
        cwd,
        stdio: [stdin, stdout, stdout],
        env: {
          ...process.env,
          // In the unusual `inherit/pipe` mode we display pnpm's output
          // Ourselves. When attached to a TTY, explicitly requesting color
          // Preserves useful pnpm color output despite stdout being piped.
          ...(stdin === "inherit" && stdout === "pipe" && process.stdout.isTTY
            ? { FORCE_COLOR: "1" }
            : {}),
          ...env,
        },
      })
    } catch (error) {
      reject(error)
      return
    }

    let settled = false

    const output: {
      stdout: Buffer[]
      stderr: Buffer[]
    } = { stdout: [], stderr: [] }

    // StringDecoder remembers incomplete UTF-8 sequences between writes.
    // Example: the three bytes of `€` might arrive as 2 bytes + 1 byte.
    // Calling Buffer#toString on each chunk separately would corrupt that
    // Character; StringDecoder waits until it has enough bytes.
    const stdoutDecoder = new StringDecoder("utf8")
    const stderrDecoder = new StringDecoder("utf8")

    // In interactive `inherit/pipe` mode we add a prefix to complete lines.
    // A process can send half a line in one chunk and the rest in another, so
    // These variables hold the unfinished line between `data` events.
    let stdoutLineRemainder = ""
    let stderrLineRemainder = ""

    // Each invocation gets its own handler function. That matters for cleanup:
    // `process.off` removes this invocation's listener, not somebody else's.
    const forward = (signal: NodeJS.Signals) => {
      child.kill(signal)
    }
    process.on("SIGINT", forward)
    process.on("SIGTERM", forward)

    const cleanup = () => {
      process.off("SIGINT", forward)
      process.off("SIGTERM", forward)
    }

    function displayOutput(chunk: Buffer, source: "stdout" | "stderr"): void {
      // Always retain the raw bytes. This is needed even in interactive mode
      // Because callers may need the exact final stdout/stderr contents.
      output[source].push(chunk)

      // Only the `inherit/pipe` mode is meant to decorate output for display.
      // In `ignore/pipe` mode stdout/stderr are data channels, not terminal UI.
      if (stdin !== "inherit" || stdout !== "pipe") {
        return
      }

      const decoder = source === "stdout" ? stdoutDecoder : stderrDecoder
      const decoded = decoder.write(chunk)
      const current = (source === "stdout" ? stdoutLineRemainder : stderrLineRemainder) + decoded

      // Accept all conventional line endings. Splitting on `\n` alone would
      // Leave a stray `\r` when a child uses Windows-style CRLF output.
      const parts = current.split(/\r\n|\n|\r/u)
      const remainder = parts.pop() ?? ""

      if (source === "stdout") {
        stdoutLineRemainder = remainder
      } else {
        stderrLineRemainder = remainder
      }

      for (const line of parts) {
        process[source].write(`│ ${line}${process.platform === "win32" ? "\r\n" : "\n"}`)
      }
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      // Node normally provides Buffers here because no encoding was set, but
      // Accepting strings makes this wrapper tolerant of simple test doubles.
      displayOutput(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), "stdout")
    })

    child.stderr?.on("data", (chunk: Buffer | string) => {
      displayOutput(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), "stderr")
    })

    // IMPORTANT: use `on`, not `once`.
    //
    // The Promise itself can only settle once, but EventEmitter error events
    // Are a separate concern. If a listener registered with `once` handles
    // The first error and is then removed, a second `error` event has no
    // Listener and Node treats that as an uncaught/unhandled EventEmitter
    // Error. Keeping this listener attached makes later errors harmless while
    // `settled` ensures only the first one affects our Promise.
    child.on("error", (error) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      reject(error)
    })

    child.on("close", (code, signal) => {
      // `close` normally follows `exit`, and in error scenarios it may follow
      // An `error` event. If an error already rejected the Promise, there is
      // Nothing left for `close` to resolve.
      if (settled) {
        return
      }

      settled = true
      cleanup()

      if (stdin === "inherit" && stdout === "pipe") {
        // StringDecoder#end() flushes any incomplete byte sequence remaining
        // At EOF. Without this, an incomplete final UTF-8 sequence would be
        // Silently omitted from the interactive display.
        stdoutLineRemainder += stdoutDecoder.end()
        stderrLineRemainder += stderrDecoder.end()

        // A process is allowed to finish without a final newline. Do not lose
        // That last fragment; print it as a complete display line now.
        if (stdoutLineRemainder) {
          process.stdout.write(
            `│ ${stdoutLineRemainder}${process.platform === "win32" ? "\r\n" : "\n"}`,
          )
        }
        if (stderrLineRemainder) {
          process.stderr.write(
            `│ ${stderrLineRemainder}${process.platform === "win32" ? "\r\n" : "\n"}`,
          )
        }
      }

      const stdoutText = Buffer.concat(output.stdout).toString("utf8")
      const stderrText = Buffer.concat(output.stderr).toString("utf8")

      // Node reports `code === null` when the process did not terminate with a
      // Normal numeric exit status, for example because a signal killed it.
      // The interactive API intentionally exposes a conventional failure code
      // Of 1 while preserving `signal` for capture-mode diagnostics.
      const exitCode = code ?? 1

      resolve({
        code: exitCode,
        signal,
        stdout: stdoutText,
        stderr: stderrText,
      })
    })
  })
}

type SpawnProcessAndCaptureResultOptions = {
  command: string
  args: readonly string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  spawnImpl?: SpawnFn
  onExit?: (result: Result) => void
}

/**
 * Runs a child process in capture mode. Instead of streaming the output
 * into the user's terminal, it just returns the result and turns non-zero exit codes
 * into an ordinary Error containing processes stderr.
 */
async function spawnProcessAndCaptureResult({
  command,
  args,
  cwd = process.cwd(),
  env = undefined,
  spawnImpl = child_process.spawn,
  onExit,
}: SpawnProcessAndCaptureResultOptions) {
  const result = await spawn({
    command,
    args,
    cwd,
    env,
    spawnImpl,
    stdin: "ignore",
    stdout: "pipe",
  })

  onExit?.(result)

  if (result.code !== 0) {
    const reason = result.signal ? `was killed by ${result.signal}` : `exited with ${result.code}`
    const stderr = result.stderr ? `\n${result.stderr}` : ""
    return [undefined, new Error(`${command} ${args.join(" ")} ${reason}${stderr}`)] as const
  }

  return [result.stdout.trim(), undefined] as const
}

export { spawn, spawnProcessAndCaptureResult }
export type { SpawnProcessAndCaptureResultOptions }
