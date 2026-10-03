/**
 * Run an external program ("child process") and wait for it to finish.
 *
 * The full specification (what this is for, vocabulary, every edge case and
 * why we handle it the way we do) lives in `spawn.spec.md`. Edge cases are
 * referenced below as [E1], [E2], ... so you can look up the reasoning.
 */
import type { ChildProcess, SpawnOptions } from "node:child_process"

import child_process from "node:child_process"
import { existsSync } from "node:fs"
import os from "node:os"
import process from "node:process"
import { StringDecoder } from "node:string_decoder"
import { isatty } from "node:tty"

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CommonOptions {
  command: string
  args: readonly string[]
  /** The function that actually starts the process. Injectable for tests. */
  spawnImpl: SpawnFn
  cwd?: string | undefined
  /** Extra environment variables. Merged on top of the parent's own. */
  env?: NodeJS.ProcessEnv | undefined
  /**
   * How long (ms) a child may take to stop after we asked it nicely before we
   * kill it forcefully. Default 5000. See "SIGNALS, EXPLAINED" below.
   */
  forceKillAfterMs?: number | undefined
}

/** Run silently, collect everything the child prints, return it as strings. */
interface CaptureOptions extends CommonOptions {
  stdin: "ignore"
  stdout: "pipe"
  /**
   * Maximum number of bytes kept per stream (stdout and stderr each).
   * Default 10 MiB. Exceeding it stops the child and rejects. [E22]
   */
  maxBuffer?: number | undefined
}

/** The child talks straight to the user's terminal. We see nothing. */
interface PassThroughOptions extends CommonOptions {
  stdin: "ignore" | "inherit"
  stdout: "inherit"
}

/**
 * The child can read the user's keyboard, but its output comes through us so
 * we can put a `│ ` in front of every line. Output is NOT retained. [E27-E34]
 */
interface DecoratedOptions extends CommonOptions {
  stdin: "inherit"
  stdout: "pipe"
}

type ExitOnlyOptions = PassThroughOptions | DecoratedOptions
type Options = CaptureOptions | ExitOnlyOptions

interface ExitResult {
  /**
   * Normalized exit status. See `normalizeExitCode` for the (long) story.
   * 0 = success; anything else = failure.
   */
  code: number
  /** The original signal, if Node reported signal termination, else null. */
  signal: NodeJS.Signals | null
}

interface CaptureResult extends ExitResult {
  stdout: string
  stderr: string
}

function isCapture(options: Options): options is CaptureOptions {
  return options.stdin === "ignore" && options.stdout === "pipe"
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

type ProcessErrorKind =
  /** The program could not be started at all (not found, no permission…). */
  | "spawn-failed"
  /** The program ran but reported failure (non-zero exit code). */
  | "non-zero-exit"
  /** We stopped the program because it printed more than `maxBuffer`. */
  | "output-limit"
  /** Node reported a problem with a program that was already running. */
  | "process-error"

interface ProcessErrorInit {
  kind: ProcessErrorKind
  message: string
  command: string
  args: readonly string[]
  code?: number | undefined
  signal?: NodeJS.Signals | null | undefined
  stdout?: string | undefined
  stderr?: string | undefined
  cause?: unknown
}

/**
 * The one error type this module produces. Callers can look at structured
 * fields (`kind`, `code`, `stderr`, …) instead of parsing the message. [E37]
 *
 * The message deliberately does NOT contain `args`: arguments often carry
 * secrets (`--token abc123`) and error messages end up in logs. The args are
 * still available as `error.args` for callers who know it is safe. [E38]
 */
class ProcessError extends Error {
  readonly kind: ProcessErrorKind
  readonly command: string
  readonly args: readonly string[]
  readonly code: number | undefined
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string

  constructor(init: ProcessErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = "ProcessError"
    this.kind = init.kind
    this.command = init.command
    this.args = init.args
    this.code = init.code
    this.signal = init.signal ?? null
    this.stdout = init.stdout ?? ""
    this.stderr = init.stderr ?? ""
  }
}

function describeReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function spawnFailure(
  error: unknown,
  command: string,
  args: readonly string[],
  cwd: string | undefined,
): ProcessError {
  // Node reports "spawn pnpm ENOENT" both when the *program* is missing and
  // when the *working directory* is missing. Those are very different
  // problems, so we check which one it is. [E4]
  const cwdIsMissing =
    isErrnoException(error) && error.code === "ENOENT" && cwd !== undefined && !existsSync(cwd)

  const message = cwdIsMissing
    ? `Could not start "${command}": the working directory does not exist: ${cwd}`
    : `Could not start "${command}": ${describeReason(error)}`

  return new ProcessError({ kind: "spawn-failed", message, command, args, cause: error })
}

// ─────────────────────────────────────────────────────────────────────────────
// Exit codes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EXIT CODES, EXPLAINED FROM SCRATCH
 *
 * When a program ends, it leaves behind one small number for whoever started
 * it: the "exit code" (also called "exit status"). It is the program's way of
 * saying how things went:
 *
 *   0       "everything went fine"
 *   1..255  "something went wrong" (the exact number is up to the program;
 *           `1` is the generic "failed", `2` often means "bad arguments", …)
 *
 * Shell scripts, CI systems and `if (code !== 0)` checks all rely on this.
 *
 * BUT: a program can also end *without ever choosing a number*, because
 * something killed it from outside: the user pressed Ctrl+C, an administrator
 * ran `kill`, the system ran out of memory, and so on. That "something" is
 * delivered as a SIGNAL (more on signals below). In that case there is no
 * exit code at all, and Node tells us so by giving us `code === null` and
 * `signal === "SIGTERM"` (or whichever signal it was).
 *
 * We still need to hand callers *one number*, because most code is written
 * as "is it zero? good. Otherwise, bad." What number do we invent?
 *
 *   The old version always said `1`. That throws information away: "the
 *   program crashed on its own" and "the user pressed Ctrl+C" look identical.
 *
 *   The Unix convention (used by bash, zsh, Docker, Kubernetes, CI systems…)
 *   is:   128 + (the signal's number)
 *
 *        Ctrl+C        = SIGINT  = signal 2   →  128 + 2  = 130
 *        `kill <pid>`  = SIGTERM = signal 15  →  143
 *        forced kill   = SIGKILL = signal 9   →  137
 *
 *   Why 128? Real exit codes are rarely above ~125, so adding 128 gives a
 *   range of numbers that means "this was a signal, not a normal exit",
 *   and the original signal can be recovered by subtracting 128.
 *
 * Practical payoff: if your CLI ends with `process.exit(result.code)`, then a
 * script wrapping your CLI sees 130 after Ctrl+C, exactly as it would with
 * any other well-behaved command-line tool. [E13]
 *
 * The raw `signal` name is still returned next to the number, so nothing is
 * lost. We only fall back to plain `1` if Node gave us neither a code nor a
 * signal we recognize (should never happen, but we never return `null`).
 */
function normalizeExitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) {
    return code
  }

  if (signal !== null) {
    const signalNumber = os.constants.signals[signal] as number | undefined
    if (signalNumber !== undefined) {
      return 128 + signalNumber
    }
  }

  // [E11] Neither a code nor a known signal: should not happen, but callers
  // are promised a number, never `null`.
  return 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Signals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SIGNALS, EXPLAINED FROM SCRATCH
 *
 * A "signal" is a tiny message the operating system can send to a running
 * process, a bit like tapping someone on the shoulder. A signal carries no
 * text, only its type. The ones we care about:
 *
 *   SIGINT   "interrupt": what Ctrl+C in a terminal sends. A polite request
 *            to stop. The receiver may clean up first, or even ignore it.
 *   SIGTERM  "terminate": what `kill <pid>` sends by default, and what most
 *            CI systems and process managers (Docker stop, systemd,
 *            Kubernetes) send when they want a job to end. Also polite.
 *   SIGHUP   "hang up": sent when the terminal window the program runs in is
 *            closed. Polite.
 *   SIGKILL  "kill": NOT polite. The operating system ends the process
 *            immediately; the process is never told and cannot object, clean
 *            up, or ignore it. A last resort, because it may leave temporary
 *            files behind or half-written data.
 *
 * Our situation: this Node program (the PARENT) started another program (the
 * CHILD) and is waiting for it. Now somebody sends a signal. Who receives it?
 *
 *   • Node's default behaviour is: the parent dies instantly. The child is
 *     left running as an orphan, still writing to the terminal, still holding
 *     lockfiles: very confusing.
 *   • The moment we install our own signal listener, Node stops dying by
 *     default. The parent now survives, waits for the child to finish, and
 *     can report how it ended. Installing a listener is therefore a
 *     *responsibility*: we must make sure the child really stops, otherwise
 *     the user can no longer interrupt the program at all. [E14]
 *
 * THE TERMINAL TWIST (why SIGINT is special)
 *
 * When a human presses Ctrl+C, the *terminal* does not send the signal to one
 * process. It sends it to the whole "foreground process group": the parent
 * AND the child (and the child's children) all receive it, by themselves.
 * If we also forwarded it, the child would get Ctrl+C TWICE. Many tools treat
 * a second Ctrl+C as "I'm impatient, abort without cleaning up", so we would
 * turn a graceful shutdown into a rough one. [E15]
 *
 * But SIGTERM and SIGHUP are only sent to the parent (`kill <parent-pid>`
 * addresses exactly one process). Nobody tells the child, so we must pass
 * those on. SIGINT sent by a script or CI (no terminal involved) is the same
 * story: nobody else will tell the child, so then we pass it on too.
 *
 * OUR POLICY
 *
 *   1. SIGTERM and SIGHUP → always forward to the child. [E17]
 *   2. SIGINT → forward only when there is NO terminal attached. If a
 *      terminal is attached, the terminal already informed the child.
 *      (We check stdin, stdout and stderr: if any of them is a terminal we
 *      assume a human is at the keyboard.)
 *   3. Whatever the signal, the parent keeps waiting for the child, but not
 *      forever. A child that ignores polite requests would make the whole
 *      program un-stoppable. So: if the child has not finished within
 *      `forceKillAfterMs` (5 s by default), OR a second signal arrives
 *      (the user is clearly impatient), we send SIGKILL. [E14]
 *
 * LIMIT: signals go to the child process we started, not to ITS children (a
 * `pnpm run build` that starts `tsc` signals `pnpm`, which is expected to pass
 * it on). [E20]
 *
 * This module never calls `process.exit()`. It only reports how the child
 * ended (see exit codes above); what the CLI does next is the caller's call.
 * [E21]
 */
const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const

type SignalListener = (signal: NodeJS.Signals) => void

const activeSignalListeners = new Set<SignalListener>()

function dispatchSignal(signal: NodeJS.Signals): void {
  // Copy first: a listener may unsubscribe itself while we iterate.
  for (const listener of [...activeSignalListeners]) {
    listener(signal)
  }
}

/**
 * Many children may run at the same time (`Promise.all`). If every one of
 * them added its own `process.on("SIGINT", …)`, Node would print
 * "MaxListenersExceededWarning" after ten. Instead we keep ONE real listener
 * on `process` per signal, installed when the first child starts and removed
 * when the last one ends, and fan the signal out to every running child.
 * [E16]
 *
 * Returns an `unsubscribe` function (safe to call more than once).
 */
function subscribeToSignals(listener: SignalListener): () => void {
  if (activeSignalListeners.size === 0) {
    for (const signal of FORWARDED_SIGNALS) {
      process.on(signal, dispatchSignal)
    }
  }
  activeSignalListeners.add(listener)

  return () => {
    if (!activeSignalListeners.delete(listener)) {
      return
    }
    if (activeSignalListeners.size === 0) {
      // [E19] Back to Node's default behaviour (die on Ctrl+C) once nothing runs.
      for (const signal of FORWARDED_SIGNALS) {
        process.off(signal, dispatchSignal)
      }
    }
  }
}

function isTerminalAttached(): boolean {
  // `isatty(fd)` only asks the OS "is file descriptor N a terminal?". Unlike
  // touching `process.stdin`, it does not create any stream objects.
  return isatty(0) || isatty(1) || isatty(2)
}

// ─────────────────────────────────────────────────────────────────────────────
// Decorating output with a `│ ` prefix, without breaking terminal tricks
// ─────────────────────────────────────────────────────────────────────────────

const LINE_PREFIX = "│ "

/**
 * Where the (imaginary) cursor is on the current terminal line.
 *
 *   "fresh"    column 0 of a brand-new line (after `\n`, or at the very
 *              start). Needs a prefix before anything else, even before an
 *              empty line, so the `│` bar stays unbroken.
 *   "returned" the cursor jumped back to column 0 of a line that already has
 *              content (after `\r`, or "cursor to column 1"). Programs do this
 *              to REDRAW a line (progress bars, spinners). The old prefix is
 *              about to be overwritten, so we print a new one before the
 *              next visible character, but NOT before `\n` (that would
 *              corrupt a Windows-style `\r\n` line ending).
 *   "inside"   somewhere in the middle of a line; the prefix is already there.
 */
type LineState = "fresh" | "returned" | "inside"

/**
 * Where we are inside a "terminal escape sequence". [E30]
 *
 * Terminals are controlled by invisible text. A program prints the characters
 * ESC `[` `2` `K` (4 characters) and the terminal does not display them,
 * instead it *erases the line*. Colors, cursor movement ("go up 1 line"),
 * hiding the cursor: all of it is done this way. Such a command is called an
 * ANSI escape sequence. If we inserted our `│ ` in the middle of one, the
 * terminal would see garbage, so we track whether we are inside one:
 *
 *   "none"        ordinary text
 *   "esc"         just saw ESC (0x1B); the next character says what kind
 *   "csi"         inside ESC `[` … (colors, cursor movement, erase…), ends
 *                 at a "final" character in the range `@` … `~`
 *   "string"      inside ESC `]` … (window title, hyperlinks), ends at BEL
 *                 or at ESC `\`
 *   "string-esc"  inside a "string" and just saw ESC (maybe the end marker)
 */
type EscapeState = "none" | "esc" | "csi" | "string" | "string-esc"

const ESC = "\x1b"
const BEL = "\x07"

function isVisible(char: string): boolean {
  // Everything below the space character is a "control character" that
  // does not draw anything (newline, carriage return, bell, backspace…).
  // Tab is the exception: it draws whitespace, so a line starting with a tab
  // still needs its prefix.
  return char === "\t" || (char >= " " && char !== "\x7f")
}

/**
 * Streams text through, inserting `│ ` at the start of each line.
 *
 * One instance per output stream (stdout and stderr each get their own).
 *
 * Why this is a small state machine instead of `text.split("\n")`:
 *
 *  • Text arrives in arbitrary pieces. A line, a `\r\n`, a UTF-8 character or
 *    an escape sequence can each be cut between two pieces. We keep state
 *    between calls, so cutting is harmless. [E5, E28, E30]
 *  • We never wait for a newline. A prompt like `Continue? (y/n) ` has none
 *    and the user must see it right away. [E29]
 *  • Everything the child printed is passed through unchanged, character for
 *    character. We only ever ADD prefixes, never remove or rewrite
 *    characters, so colors, cursor movement and `\r` progress bars keep
 *    working. [E31]
 *
 * WHERE THE PREFIX GOES (this matters more than it looks) [E31]
 *
 *  • The prefix is printed right before the first *visible* character of a
 *    line, i.e. AFTER cursor/erase commands. If a program prints "erase this
 *    line" and then new text, our prefix must land after the erase, or the
 *    erase would wipe it.
 *  • The one exception is COLOR commands (`ESC [ … m`). A line such as
 *    `<green>done<reset>` should keep a plain-colored bar, not a green one.
 *    Color commands change nothing about where the cursor is, so it is safe
 *    to delay them until after the prefix. We hold them back and release
 *    them right after the prefix (or at the end of the chunk, whichever
 *    comes first, so a color reset can never be held back for long).
 *
 * Limits [E34] (also listed in the spec): full-screen programs (`vim`, `htop`,
 * anything using the "alternate screen") and programs that rely on knowing the
 * exact terminal width cannot be decorated perfectly, because our prefix
 * takes two columns the program does not know about.
 *
 * @internal Exported only so it can be unit-tested.
 */
class LinePrefixer {
  private readonly decoder = new StringDecoder("utf8")
  private line: LineState = "fresh"
  private escape: EscapeState = "none"
  /** The parameter characters of the CSI sequence being read (`2`, `?25`, …). */
  private csiParams = ""
  /**
   * The escape sequence currently being read. We keep it (instead of printing
   * it character by character) so that we can decide, once it is complete,
   * whether to print it now or to hold it back (colors).
   */
  private sequence = ""
  /** Color commands waiting to be printed right after the next prefix. */
  private heldColors = ""

  /** Feed raw bytes; get back the text to print. */
  write(chunk: Buffer): string {
    return this.transform(this.decoder.write(chunk)) + this.releaseHeldColors()
  }

  /** Call once when the stream is over. Returns any final text to print. */
  end(): string {
    // `decoder.end()` flushes a UTF-8 character that was cut off at the very
    // end of the stream (it becomes the "�" replacement character).
    let tail = this.transform(this.decoder.end())
    tail += this.releaseHeldColors()

    // An escape sequence that never finished: print what we have rather than
    // swallow it.
    tail += this.sequence
    this.sequence = ""
    this.escape = "none"

    // If the child ended while we were mid-line (for example it printed a
    // prompt and was then killed), move to a fresh line so that whatever the
    // parent prints next does not get glued onto the child's last line. [E32]
    return this.line === "inside" ? `${tail}\n` : tail
  }

  private releaseHeldColors(): string {
    const held = this.heldColors
    this.heldColors = ""
    return held
  }

  private transform(text: string): string {
    let out = ""
    for (let index = 0; index < text.length; index += 1) {
      out += this.consume(text.charAt(index))
    }
    return out
  }

  /** Returns what to print right now for this one character. */
  private consume(char: string): string {
    switch (this.escape) {
      case "esc":
        return this.consumeAfterEscape(char)
      case "csi":
        return this.consumeInsideCsi(char)
      case "string":
        if (char === ESC) {
          this.sequence = ESC
          this.escape = "string-esc"
          return ""
        }
        if (char === BEL) {
          this.escape = "none"
        }
        return char
      case "string-esc":
        if (char === "\\") {
          this.escape = "none"
          return this.takeSequence(char)
        }
        // ESC followed by something else was not the end marker after all:
        // it is the start of a new sequence.
        this.escape = "esc"
        return this.consumeAfterEscape(char)
      case "none":
        return this.consumePlain(char)
    }
  }

  /** Print the sequence collected so far, plus `char`, and forget it. */
  private takeSequence(char: string): string {
    const text = this.sequence + char
    this.sequence = ""
    return text
  }

  private consumePlain(char: string): string {
    switch (char) {
      case ESC:
        this.escape = "esc"
        this.sequence = ESC
        return ""

      case "\n": {
        // An empty line in a "fresh" position still gets a prefix, so the
        // bar `│` does not have gaps. After `\r` (state "returned") it must
        // not: `\r\n` is a single line ending, not an empty line. [E28]
        const prefix = this.line === "fresh" ? LINE_PREFIX : ""
        this.line = "fresh"
        return prefix + this.releaseHeldColors() + char
      }

      case "\r":
        if (this.line === "inside") {
          this.line = "returned"
        }
        return char

      default:
        if (!isVisible(char)) {
          return char
        }
        if (this.line === "inside") {
          return char
        }
        this.line = "inside"
        return LINE_PREFIX + this.releaseHeldColors() + char
    }
  }

  private consumeAfterEscape(char: string): string {
    if (char === "[") {
      this.escape = "csi"
      this.csiParams = ""
      this.sequence += char
      return ""
    }

    // ESC ] (OSC), ESC P (DCS), ESC X (SOS), ESC ^ (PM), ESC _ (APC): all are
    // "strings" that run until BEL or ESC \
    if (char === "]" || char === "P" || char === "X" || char === "^" || char === "_") {
      this.escape = "string"
      return this.takeSequence(char)
    }

    if (char === ESC) {
      // ESC ESC: the first one was pointless; the second starts over.
      const abandoned = this.sequence
      this.sequence = ESC
      return abandoned
    }

    const code = char.charCodeAt(0)

    if (code < 0x20) {
      // A control character right after ESC: the sequence was abandoned.
      const abandoned = this.sequence
      this.sequence = ""
      this.escape = "none"
      return abandoned + this.consumePlain(char)
    }

    if (code >= 0x20 && code <= 0x2f) {
      // "Intermediate" character (like the `(` in ESC ( B): more follows.
      return this.takeSequence(char)
    }

    // Any other character is the final one of a short sequence, like ESC 7
    // (save cursor) or ESC M (reverse line feed).
    this.escape = "none"
    return this.takeSequence(char)
  }

  private consumeInsideCsi(char: string): string {
    if (char === ESC) {
      const abandoned = this.sequence
      this.sequence = ESC
      this.escape = "esc"
      return abandoned
    }

    const code = char.charCodeAt(0)

    if (code >= 0x30 && code <= 0x3f) {
      // Parameter characters: digits, `;`, `?`… We only need to recognize a
      // handful of short sequences, so we cap what we remember.
      if (this.csiParams.length < 16) {
        this.csiParams += char
      }
      this.sequence += char
      return ""
    }

    if (code >= 0x20 && code <= 0x2f) {
      this.sequence += char // Intermediate characters.
      return ""
    }

    if (code >= 0x40 && code <= 0x7e) {
      // Final character: the sequence is complete.
      this.escape = "none"
      const complete = this.takeSequence(char)
      this.afterCsi(char)

      // Color commands wait until after the prefix (see class comment).
      if (char === "m" && this.line !== "inside") {
        this.heldColors += complete
        return ""
      }
      return complete
    }

    // A control character in the middle of a CSI: malformed. Give up on the
    // sequence and treat the character as ordinary text.
    const abandoned = this.sequence
    this.sequence = ""
    this.escape = "none"
    return abandoned + this.consumePlain(char)
  }

  /**
   * Some cursor commands put the cursor back at column 0. Programs use those
   * to redraw a line, which wipes out our prefix, so we must print it again.
   */
  private afterCsi(finalChar: string): void {
    switch (finalChar) {
      case "G": {
        // ESC [ n G  = "move to column n" (no n, 0 or 1 all mean column 1)
        if (this.csiParams === "" || this.csiParams === "0" || this.csiParams === "1") {
          if (this.line === "inside") {
            this.line = "returned"
          }
        }
        break
      }
      case "E":
      case "F":
        // ESC [ n E / F = "start of the line n lines down / up". The target
        // line probably has content already.
        this.line = "returned"
        break
      default:
        break
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The main function
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024
const DEFAULT_FORCE_KILL_AFTER_MS = 5_000
/**
 * After the child has exited, how long we wait for its output pipes to finish
 * closing before giving up on them. [E10]
 */
const STDIO_DRAIN_GRACE_MS = 1_000

type StreamName = "stdout" | "stderr"

/**
 * Starts a process and resolves when it has finished.
 *
 * Three modes, chosen by `stdin`/`stdout`:
 *
 *  - `ignore` + `pipe`    CAPTURE: nothing is shown; output is returned.
 *  - `inherit` + `pipe`   DECORATED: output is shown with a `│ ` prefix and
 *                         is not stored. The child can read the keyboard.
 *  - anything + `inherit` PASS-THROUGH: the child owns the terminal.
 *
 * Resolves with the exit status (a non-zero exit is NOT an error here, it is
 * data [E7]). Rejects with a `ProcessError` when the process could not be started,
 * when Node reports a problem with the running process, or when capture
 * output exceeds `maxBuffer`.
 */
function spawn(options: CaptureOptions): Promise<CaptureResult>
function spawn(options: ExitOnlyOptions): Promise<ExitResult>
function spawn(options: Options): Promise<CaptureResult | ExitResult> {
  return new Promise((resolve, reject) => {
    const { command, args, cwd, spawnImpl, stdin, stdout, env: envFromOptions } = options
    const capturing = isCapture(options)
    const decorating = stdin === "inherit" && stdout === "pipe"
    const maxBuffer = (capturing ? options.maxBuffer : undefined) ?? DEFAULT_MAX_BUFFER
    const forceKillAfterMs = options.forceKillAfterMs ?? DEFAULT_FORCE_KILL_AFTER_MS

    // [E1] Starting a process can throw immediately (bad arguments, or an
    // injected `spawnImpl` that fails). Different from the asynchronous
    // `error` event below: here there is no child to listen to at all.
    let child: ChildProcess

    try {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...envFromOptions,
      }

      // When we pipe the child's output through ourselves, the child sees "my
      // output is not a terminal" and turns colors off. If a human is looking
      // at a terminal, ask for colors anyway, UNLESS they already said
      // something about colors themselves (FORCE_COLOR=0, NO_COLOR=1…). [E33]
      if (decorating && isatty(1) && env["FORCE_COLOR"] === undefined && !env["NO_COLOR"]) {
        env["FORCE_COLOR"] = "1"
      }

      child = spawnImpl(command, args, {
        cwd,
        stdio: [stdin, stdout, stdout],
        env,
      })
    } catch (error) {
      reject(spawnFailure(error, command, args, cwd))
      return
    }

    // ── State ────────────────────────────────────────────────────────────

    let settled = false
    let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | undefined
    let runtimeError: Error | undefined
    let outputLimitStream: StreamName | undefined
    let signalsReceived = 0
    let forceKillTimer: NodeJS.Timeout | undefined
    let drainTimer: NodeJS.Timeout | undefined

    const captured: Record<StreamName, Buffer[]> = { stdout: [], stderr: [] }
    const capturedBytes: Record<StreamName, number> = { stdout: 0, stderr: 0 }
    const prefixers = decorating
      ? { stdout: new LinePrefixer(), stderr: new LinePrefixer() }
      : undefined

    // ── Stopping the child (signals, output limit) ───────────────────────

    // [E18] Calling `kill` on a process that already ended is harmless: Node
    // simply returns `false`. And once settled we are unsubscribed anyway.
    const forceKill = (): void => {
      child.kill("SIGKILL")
    }

    /** Arm the countdown after which a stubborn child gets SIGKILL. [E14] */
    const startForceKillCountdown = (): void => {
      forceKillTimer ??= setTimeout(forceKill, forceKillAfterMs)
    }

    const stopChild = (signal: NodeJS.Signals): void => {
      child.kill(signal)
      startForceKillCountdown()
    }

    // See "SIGNALS, EXPLAINED FROM SCRATCH" above for the reasoning.
    const onSignal = (signal: NodeJS.Signals): void => {
      signalsReceived += 1

      // A second signal means the user is impatient. [E14]
      if (signalsReceived > 1) {
        forceKill()
        return
      }

      // [E15] A terminal already told the child about Ctrl+C. Telling it
      // again would look like "Ctrl+C twice". Just start the countdown.
      if (signal === "SIGINT" && isTerminalAttached()) {
        startForceKillCountdown()
        return
      }

      stopChild(signal)
    }

    const unsubscribeFromSignals = subscribeToSignals(onSignal)

    // ── Settling the Promise exactly once ────────────────────────────────

    /**
     * [E2] A ChildProcess can emit several events (`error`, `exit`, `close`)
     * in sequence. The Promise may only be decided once, so everything that
     * resolves or rejects goes through here. It also removes the signal
     * subscription and timers on EVERY way out. [E3]
     */
    const settle = (action: () => void): void => {
      if (settled) {
        return
      }
      settled = true
      unsubscribeFromSignals()
      clearTimeout(forceKillTimer)
      clearTimeout(drainTimer)
      action()
    }

    const finalize = (): void => {
      settle(() => {
        if (prefixers) {
          for (const name of ["stdout", "stderr"] as const) {
            const tail = prefixers[name].end()
            if (tail) {
              process[name].write(tail)
            }
          }
        }

        const info = exitInfo ?? { code: null, signal: null }
        const stdoutText = Buffer.concat(captured.stdout).toString("utf8")
        const stderrText = Buffer.concat(captured.stderr).toString("utf8")

        if (runtimeError) {
          reject(
            new ProcessError({
              kind: "process-error",
              message: `"${command}" reported an error while running: ${runtimeError.message}`,
              command,
              args,
              stdout: stdoutText,
              stderr: stderrText,
              cause: runtimeError,
            }),
          )
          return
        }

        if (outputLimitStream) {
          reject(
            new ProcessError({
              kind: "output-limit",
              message: `"${command}" wrote more than ${maxBuffer} bytes to ${outputLimitStream}, so it was stopped`,
              command,
              args,
              code: normalizeExitCode(info.code, info.signal),
              signal: info.signal,
              stdout: stdoutText,
              stderr: stderrText,
            }),
          )
          return
        }

        const base = { code: normalizeExitCode(info.code, info.signal), signal: info.signal }
        resolve(capturing ? { ...base, stdout: stdoutText, stderr: stderrText } : base)
      })
    }

    // ── Output handling ──────────────────────────────────────────────────

    const handleChunk = (name: StreamName, chunk: Buffer): void => {
      if (settled) {
        return // [E9] Late data after we already gave our answer.
      }

      if (capturing) {
        if (outputLimitStream) {
          return // Already stopping the child; ignore the rest. [E23]
        }
        // [E24] stdout and stderr are counted separately.
        capturedBytes[name] += chunk.length
        if (capturedBytes[name] > maxBuffer) {
          outputLimitStream = name
          stopChild("SIGTERM")
          return
        }
        // Raw bytes are kept and decoded once at the end, so a multi-byte
        // character split across chunks cannot be corrupted. [E5]
        captured[name].push(chunk)
        return
      }

      if (prefixers) {
        const text = prefixers[name].write(chunk)
        if (text) {
          process[name].write(text)
        }
      }
    }

    for (const name of ["stdout", "stderr"] as const) {
      const stream = child[name]
      stream?.on("data", (chunk: Buffer | string) => {
        // [E12] Node normally gives Buffers (we set no encoding). Accepting
        // strings keeps simple test doubles working.
        handleChunk(name, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      // [E8] A stream error should never become an uncaught exception.
      stream?.on("error", (error) => {
        runtimeError ??= error
      })
    }

    // ── Lifecycle events ─────────────────────────────────────────────────

    // [E3] `on`, not `once`: the Promise settles once, but Node may emit more
    // `error` events later, and an `error` event with no listener crashes the
    // whole process. This listener stays attached forever; `settled`
    // protects the Promise.
    child.on("error", (error) => {
      if (settled) {
        return
      }

      // [E6] `error` means two very different things:
      //   • no pid: the process never started (program not found, no
      //     permission…). Nothing is running, so fail now.
      //   • has pid: the process IS running but something went wrong
      //     (for example our kill attempt failed). It may still be alive, so
      //     remember the error and wait for it to really finish.
      if (child.pid === undefined) {
        settle(() => reject(spawnFailure(error, command, args, cwd)))
        return
      }
      runtimeError ??= error
    })

    // [E10] `exit` = the process ended. `close` = it ended AND its output
    // pipes are closed. Normally `close` follows within milliseconds. But if
    // the child started a background program that inherited the pipes and
    // keeps running, `close` can take forever. So after `exit` we give the
    // pipes a short grace period, then close them ourselves.
    child.on("exit", (code, signal) => {
      exitInfo = { code, signal }
      if (settled) {
        return
      }
      drainTimer = setTimeout(() => {
        child.stdout?.destroy()
        child.stderr?.destroy()
        finalize()
      }, STDIO_DRAIN_GRACE_MS)
    })

    child.on("close", (code, signal) => {
      exitInfo ??= { code, signal }
      finalize()
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrapper: run, capture, return `[output, undefined]` or `[undefined, error]`
// ─────────────────────────────────────────────────────────────────────────────

type SpawnProcessAndCaptureResultOptions = {
  command: string
  args: readonly string[]
  cwd?: string | undefined
  env?: NodeJS.ProcessEnv | undefined
  spawnImpl?: SpawnFn | undefined
  maxBuffer?: number | undefined
  forceKillAfterMs?: number | undefined
  /** Called with the result whenever the process ran to completion (any exit code). */
  onExit?: ((result: CaptureResult) => void) | undefined
}

/** How much of the child's stderr we put in an error message. [E38] */
const MAX_STDERR_IN_MESSAGE = 4_000

/**
 * Runs a child process silently and returns its output, or an error.
 *
 * EVERY failure comes back in the tuple: could not start, non-zero exit,
 * killed by a signal, too much output. Callers handle one channel, not two.
 * [E36] Only genuine bugs (for example `onExit` throwing) are thrown.
 *
 * The returned text has trailing whitespace removed but leading whitespace
 * kept, because it can be meaningful (` M file.ts` from `git status`). [E26]
 */
async function spawnProcessAndCaptureResult({
  command,
  args,
  cwd = process.cwd(),
  env,
  spawnImpl = child_process.spawn,
  maxBuffer,
  forceKillAfterMs,
  onExit,
}: SpawnProcessAndCaptureResultOptions): Promise<[undefined, ProcessError] | [string, undefined]> {
  let result: CaptureResult
  try {
    result = await spawn({
      command,
      args,
      cwd,
      env,
      spawnImpl,
      maxBuffer,
      forceKillAfterMs,
      stdin: "ignore",
      stdout: "pipe",
    })
  } catch (error) {
    if (error instanceof ProcessError) {
      return [undefined, error]
    }
    throw error // [E35] Anything else is a bug, not a process failure.
  }

  onExit?.(result)

  if (result.code !== 0) {
    const reason = result.signal
      ? `was killed by ${result.signal}`
      : `exited with code ${result.code}`
    const stderr = result.stderr.trimEnd()
    const shownStderr =
      stderr.length > MAX_STDERR_IN_MESSAGE ? `…${stderr.slice(-MAX_STDERR_IN_MESSAGE)}` : stderr

    return [
      undefined,
      new ProcessError({
        kind: "non-zero-exit",
        message: `${command} ${reason}${shownStderr ? `\n${shownStderr}` : ""}`,
        command,
        args,
        code: result.code,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
      }),
    ]
  }

  // TODO Why trimend?
  return [result.stdout.trimEnd(), undefined]
}

export { LinePrefixer, ProcessError, spawn, spawnProcessAndCaptureResult }
export type {
  CaptureOptions,
  CaptureResult,
  ExitOnlyOptions,
  ExitResult,
  ProcessErrorKind,
  SpawnProcessAndCaptureResultOptions,
}
