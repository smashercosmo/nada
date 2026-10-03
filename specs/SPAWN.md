# `spawn` — Specification

*Companion to `spawn.ts`. Edge cases are numbered **[E1] … [E38]**; the same numbers appear in the code comments and in the tests, so you can jump between the three.*

## Contents

1. [In one minute](#1-in-one-minute)
2. [Background: how programs run other programs](#2-background-how-programs-run-other-programs) *(no prior knowledge assumed)*
3. [Goals and non-goals](#3-goals-and-non-goals)
4. [Public API](#4-public-api)
5. [The life of a call, step by step](#5-the-life-of-a-call-step-by-step)
6. [Edge-case catalog [E1]–[E38]](#6-edge-case-catalog)
7. [Decision log](#7-decision-log)
8. [Known limitations](#8-known-limitations)
9. [Differences from the previous version](#9-differences-from-the-previous-version)
10. [Verification](#10-verification)

---

## 1. In one minute

Our command-line tool often needs to run *other* programs: `pnpm install`, `git status`, and so on. `spawn` is the one place that knows how to do that **safely**. You give it a command and arguments; it starts the program, waits for it, and tells you **how it ended**.

It supports three ways of running a program:

| Mode | You choose | What the user sees | What you get back |
|---|---|---|---|
| **Capture** | `stdin: "ignore"`, `stdout: "pipe"` | Nothing. The program runs silently. | Everything it printed, as text, plus how it ended. |
| **Decorated** | `stdin: "inherit"`, `stdout: "pipe"` | The program's output, with `│ ` in front of every line. The user can type answers to prompts. | How it ended. (Output is shown, not stored.) |
| **Pass-through** | `stdout: "inherit"` | The program talks straight to the terminal; we are out of the way. | How it ended. |

Almost all of the complexity in this module comes from the fact that **"run a program and wait for it" sounds trivial but has about forty ways to go subtly wrong**: the program might not exist, might print half a character, might ignore Ctrl+C, might leave a background process holding the output open forever, might print more than fits in memory, and so on. This document lists every one of them, and what we do about it.

There is also a small helper, `spawnProcessAndCaptureResult`, which wraps Capture mode into the shape most callers want: *"give me the output, or an error"*.

---

## 2. Background: how programs run other programs

Skip this section if you already know processes, pipes, exit codes and signals. Everything later builds on it.

### 2.1 Processes, parents and children

A program on disk is just a file. When you *run* it, the operating system creates a **process**: a live instance of the program, with its own memory and its own ID number (the **PID**).

Our tool is a process. When it runs `pnpm install`, it asks the operating system to start a *second* process. The new one is the **child**; our tool is its **parent**. The parent can wait for the child, read what it prints, and find out how it ended.

> **Analogy.** A manager (the parent) hands a task to an employee (the child) and waits at the door. The employee can talk through three "phone lines" while working (§2.3) and, when finished, leaves a one-number report card (§2.5).

### 2.2 What you give the operating system when you start a process

| Piece | Example | Notes |
|---|---|---|
| **command** | `"pnpm"` | The program to run. |
| **args** | `["install", "--frozen-lockfile"]` | A *list*, not one string. Each item reaches the program exactly as written; no shell is involved, so no quoting rules apply. |
| **cwd** | `"/home/me/project"` | The "current directory" the program starts in. |
| **env** | `{ FORCE_COLOR: "1" }` | *Environment variables*: named settings that every process inherits from its parent (`PATH`, `HOME`, …). We start from the parent's variables and lay the caller's on top. Setting a key to `undefined` **removes** it for the child. |

### 2.3 The three channels: stdin, stdout, stderr

Every process has three built-in communication channels:

| Channel | Direction | Used for |
|---|---|---|
| **stdin** | into the program | Input: what the user types, or data fed to it. |
| **stdout** | out of the program | Normal output ("here are the results"). |
| **stderr** | out of the program | Diagnostics and warnings. Kept separate so that results can be piped elsewhere while problems still reach the human. |

When *we* start a child we decide, for each channel, what it is connected to:

| Setting | Meaning | Picture |
|---|---|---|
| `"inherit"` | Same as ours. If our stdout is the user's terminal, the child writes straight to the terminal. | Child talks directly to the user. We see nothing. |
| `"pipe"` | The operating system creates a **pipe**: a one-way tube between the two processes. We read what comes out of it. | We stand between the child and the user. |
| `"ignore"` | Connected to nothing. Reading from it gives "end of input"; writing to it is thrown away. | Child talks to a wall. |

Two facts about pipes drive many of our design choices:

* **Data arrives in chunks of arbitrary size.** Like water poured through a hose in buckets: a line of text, a Windows line ending (`\r\n`), a single accented letter, or a terminal command can be **cut between two buckets**. Code that assumes "one chunk = one line" is wrong.
* **A pipe has limited capacity.** If nobody reads from it, the child eventually *blocks*, frozen, waiting. So we must always keep reading.

### 2.4 Text: bytes versus characters

Pipes carry **bytes**, not characters. Most characters take one byte, but some take more: `€` takes three, an emoji four. If a chunk ends after two of the three bytes of `€`, converting that chunk to text on its own produces garbage (`�`). Anything that turns bytes into text must **remember incomplete characters between chunks**. (Node's `StringDecoder` does that for us.)

### 2.5 How a program ends: exit codes

When a program ends normally it leaves one small number, the **exit code**:

| Code | Meaning |
|---|---|
| `0` | Success. |
| `1`–`255` | Failure. The exact number is the program's choice (`1` generic, `2` often "bad arguments", …). |

Scripts, CI systems and our own `if (code !== 0)` all rely on this. A non-zero exit code is **not** an error in the sense of "something broke in our code". It is *information the program chose to give us*. That is why `spawn` resolves normally with a non-zero code instead of throwing **[E7]**.

### 2.6 How a program can be ended from outside: signals

A **signal** is a tiny message the operating system delivers to a process, like a tap on the shoulder. It carries no text, only a type:

| Signal | Typical cause | Nature |
|---|---|---|
| `SIGINT` | The user presses **Ctrl+C** | Polite request to stop. May be handled or ignored. |
| `SIGTERM` | `kill <pid>`; CI cancelling a job; `docker stop`; systemd | Polite request to stop. May be handled or ignored. |
| `SIGHUP` | The terminal window is closed | Polite request to stop. |
| `SIGKILL` | `kill -9`; our last resort | **Not polite.** The OS removes the process immediately. It cannot object, clean up or ignore it. |

A program killed by a signal never chooses an exit code. Node reports it as `code = null` plus the signal's name. We turn that into a single number the standard Unix way: **128 + signal number** (§6, **[E13]**).

### 2.7 Ctrl+C: who actually receives it?

When a human presses Ctrl+C, the *terminal* sends `SIGINT` to the **whole foreground process group**: our tool **and** the child (and the child's children). Each of them receives it independently.

```
        user presses Ctrl+C
               │
        the terminal sends SIGINT to everyone in the group
        ┌──────┴──────────────┐
        ▼                     ▼
  our tool (parent)      child process      ← both get it, by themselves
```

Compare `kill <our-pid>` (or a CI system stopping a job): that signal goes to **one process only**: ours. The child is not told.

This is why "just forward every signal to the child" is subtly wrong for `SIGINT` in a terminal: the child would receive it twice **[E15]**.

Also: **the moment a Node program installs a handler for a signal, Node stops dying automatically on that signal.** Handling a signal is a responsibility: if we handle Ctrl+C but then never stop, the user can no longer interrupt the program **[E14]**.

### 2.8 Terminals and why programs behave differently in them

A **terminal** (TTY) is the window where a human types commands. Programs ask themselves *"is my output a terminal?"* and change behavior:

* connected to a terminal → colors, spinners and progress bars that redraw themselves, interactive prompts;
* connected to a pipe or file → plain text, no colors.

When we `pipe` a child's output, the child concludes "nobody is watching" and turns the colors off, even though a human is watching *us*. Hence our `FORCE_COLOR` handling **[E33]**.

### 2.9 Escape sequences: invisible text that controls the terminal

Terminals are controlled by invisible text. A program prints a special character (**ESC**, byte `0x1B`) followed by a few more characters, and the terminal does not show them; it *obeys* them:

| What the program prints (`ESC` written as `␛`) | What the terminal does |
|---|---|
| `␛[31m` | Switch to red text. |
| `␛[0m` | Reset colors. |
| `␛[2K` | **Erase the whole current line.** |
| `␛[1A` | Move the cursor up one line. |
| `␛[G` | Move the cursor to column 1. |
| `\r` (carriage return) | Move the cursor to column 1 (no ESC needed). |
| `␛[?25l` / `␛[?25h` | Hide / show the cursor. |

A **progress bar** is: print a line, then repeatedly move to column 1 and print it again with a new number. A **prompt** is: print a question *without a newline*, then wait for typing. A **spinner** is: erase the line, print the next frame.

Our "Decorated" mode must put `│ ` in front of lines **without breaking any of this**: so we have to understand, at least roughly, where lines begin and where escape sequences start and end (§6, E28–E34).

### 2.10 Node's three events for a child process

Node tells us about a child through events. Their order and meaning are subtle:

| Event | Fires when |
|---|---|
| `error` | Something went wrong. **Two very different meanings:** *(a)* the process could not be started at all; *(b)* the process is running but a side operation failed (for example, our attempt to kill it). |
| `exit` | The process has ended. Its output pipes may still hold data that we have not read yet. |
| `close` | The process has ended **and** all its output pipes are closed (everything has been read). Normally follows `exit` within milliseconds. |

Typical sequences:

```
Normal run:             (start) ── data … data ──► exit ──► close
Program not found:      error ──► (maybe) close(code −2)
Background process      exit ─ ─ ─ ─ ─ long wait ─ ─ ─ ─ ─► close   (or never)
 keeps the pipe open:
```

---

## 3. Goals and non-goals

### Goals

| # | Goal |
|---|---|
| G1 | Run any command and report **how it ended**, accurately, **exactly once**. |
| G2 | **Capture mode:** collect output reliably and safely (bounded memory, correct text). |
| G3 | **Decorated mode:** show output with a `│ ` prefix while keeping colors, prompts, progress bars, and cursor tricks working, and letting the user type. |
| G4 | **Never leave the user stuck.** Ctrl+C and `kill` behave sensibly; no orphaned children; no endless waiting. |
| G5 | **Never crash or leak.** No unhandled errors, no accumulating listeners, no timers left running. |
| G6 | **Errors are structured and safe to log.** Fields to inspect; no secrets in messages. |
| G7 | **Testable.** The function that actually starts processes can be replaced (`spawnImpl`). |

### Non-goals (deliberately not handled; see also §8)

* **Windows.** Not supported or tested for now (decision Q6). Several things differ there (`pnpm` is `pnpm.cmd`, signals behave differently).
* **Killing a whole tree of processes** (the child's own children).
* **Timeouts, `AbortSignal`, feeding data to the child's stdin.**
* **A real pseudo-terminal.** In Decorated mode the child's output is a pipe, not a terminal.
* **Full-screen terminal programs** (`vim`, `htop`) in Decorated mode.
* **Handling a closed parent terminal** (`EPIPE`): the application should do that.

---

## 4. Public API

### 4.1 `spawn(options)`

```ts
// Capture mode: output is collected and returned.
spawn(options: CaptureOptions): Promise<CaptureResult>

// Decorated and pass-through modes: output is NOT returned.
spawn(options: ExitOnlyOptions): Promise<ExitResult>
```

**Options**

| Option | Type | Default | Meaning |
|---|---|---|---|
| `command` | `string` | — | Program to run. |
| `args` | `readonly string[]` | — | Arguments, one list item each. |
| `spawnImpl` | `SpawnFn` | — | The function that really starts the process. Production passes `child_process.spawn`; tests pass a fake. |
| `stdin` | `"ignore"` \| `"inherit"` | — | See §1. |
| `stdout` | `"pipe"` \| `"inherit"` | — | Used for **both** stdout and stderr. |
| `cwd` | `string` | parent's | Working directory. |
| `env` | `ProcessEnv` | — | Layered on top of the parent's environment. `undefined` removes a variable. |
| `forceKillAfterMs` | `number` | `5000` | Grace period before a stubborn child gets `SIGKILL` **[E14]**. |
| `maxBuffer` | `number` | `10 MiB` | **Capture mode only.** Max bytes kept *per stream* **[E22]**. `Infinity` disables the limit. |

Only these combinations are valid; the types enforce it:

| `stdin` | `stdout` | Mode | Result type |
|---|---|---|---|
| `"ignore"` | `"pipe"` | Capture | `CaptureResult` |
| `"inherit"` | `"pipe"` | Decorated | `ExitResult` |
| `"ignore"` / `"inherit"` | `"inherit"` | Pass-through | `ExitResult` |

**Results**

```ts
interface ExitResult {
  code: number                    // 0 = success. Signal death → 128 + signal number. [E13]
  signal: NodeJS.Signals | null   // The original signal, if the program was killed by one.
}
interface CaptureResult extends ExitResult {
  stdout: string                  // Everything written to stdout (UTF-8).
  stderr: string                  // Everything written to stderr (UTF-8).
}
```

**When does it resolve, and when does it reject?**

| Situation | Outcome |
|---|---|
| Program ran and ended, **any** exit code | **Resolves** with the result. A non-zero code is data **[E7]**. |
| Program killed by a signal | **Resolves**, `signal` set, `code = 128 + n` **[E13]**. |
| Program could not be started | **Rejects** with `ProcessError`, `kind: "spawn-failed"` **[E1, E4]**. |
| Node reported a problem with a *running* program | **Rejects** (after the program really ended) with `kind: "process-error"` **[E6]**. |
| Capture output exceeded `maxBuffer` | **Rejects** with `kind: "output-limit"` **[E22]**. |

`spawn` itself **never calls `process.exit()`** **[E21]**. What the CLI does next is the caller's decision.

### 4.2 `ProcessError`

The one error type this module produces.

| Field | Meaning |
|---|---|
| `kind` | `"spawn-failed"` \| `"non-zero-exit"` \| `"output-limit"` \| `"process-error"` |
| `message` | Human-readable. **Never contains `args`** **[E38]**. |
| `command`, `args` | What was run. `args` is available here for callers who know it is safe to log. |
| `code`, `signal` | How it ended (when it got that far). |
| `stdout`, `stderr` | Whatever was captured (empty strings if nothing). |
| `cause` | The original underlying error, when there is one (standard JavaScript `cause`). |

`"non-zero-exit"` is produced only by the helper below; `spawn` itself reports a non-zero exit as a normal result.

### 4.3 `spawnProcessAndCaptureResult(options)`

Runs Capture mode and answers *"give me the output or an error"*:

```ts
const [output, error] = await spawnProcessAndCaptureResult({ command: "git", args: ["status", "--porcelain"] })
if (error) { /* error is a ProcessError; check error.kind, error.code, error.stderr */ }
else       { /* output is a string */ }
```

* **Every failure comes back in the tuple** (could not start, non-zero exit, killed by signal, too much output). Callers handle **one** channel, not two **[E36]**.
* Only genuine bugs are thrown (for example your own `onExit` callback throwing) **[E35]**.
* `output` has **trailing** whitespace removed, but **leading** whitespace is kept **[E26]**.
* `onExit(result)` is called whenever the program ran to completion, with any exit code, before the tuple is built. It is **not** called when there is no result (could not start / output limit).
* Extra options: `cwd` (default: current directory), `env`, `spawnImpl` (default `child_process.spawn`), `maxBuffer`, `forceKillAfterMs`.
* Error message format for a failed run: `<command> exited with code N` or `<command> was killed by SIGNAL`, then a new line with the **last 4000 characters** of stderr (prefixed with `…` if cut). The complete stderr is on `error.stderr`.

---

## 5. The life of a call, step by step

1. **Decide the mode** from `stdin`/`stdout`.
2. **Build the child's environment**: parent's variables, then the caller's `env` on top. In Decorated mode, on a real terminal, default `FORCE_COLOR=1` unless the user already expressed a color preference **[E33]**.
3. **Start the process.** If starting throws immediately, reject with `spawn-failed` and stop. Nothing has been registered yet, so there is nothing to undo **[E1]**.
4. **Subscribe to signals** (`SIGINT`, `SIGTERM`, `SIGHUP`) through one shared registry **[E16]**.
5. **Attach listeners** for `data` and `error` on stdout/stderr, and `error`, `exit`, `close` on the child.
6. **While the child runs:**
   * *Capture:* append each chunk to a list of raw bytes; count bytes per stream; at the limit, stop the child **[E22–E24]**.
   * *Decorated:* pass each chunk through a `LinePrefixer` and write the result to our own stdout/stderr immediately **[E27–E32]**.
   * *Signal received:* apply the signal policy below **[E14–E17]**.
7. **When `exit` fires:** remember the exit code/signal and start a short (1 s) countdown for the output pipes to finish closing **[E10]**.
8. **When `close` fires** (or the countdown ends, in which case we close the pipes ourselves): **finalize**.
9. **Finalize**, exactly once **[E2]**:
   * remove signal subscription, clear timers **[E3, E19]**;
   * Decorated: flush the `LinePrefixer`s (partial escape sequences; a final newline if we stopped mid-line) **[E32]**;
   * if a post-start `error` was recorded → reject `process-error` **[E6]**;
   * else if the output limit was hit → reject `output-limit` **[E22]**;
   * else resolve with `{ code, signal }` (+ `stdout`/`stderr` in Capture mode).

### Signal policy (summary)

| Situation | What we do |
|---|---|
| `SIGTERM` or `SIGHUP` arrives | Forward to the child **[E17]**. Start the force-kill countdown. |
| `SIGINT`, **no** terminal attached (stdin, stdout and stderr are all non-terminals) | Forward to the child. Start the countdown. |
| `SIGINT`, terminal attached | **Do not forward** (the terminal already told the child) **[E15]**. Start the countdown. |
| A **second** signal of any kind | `SIGKILL` immediately **[E14]**. |
| Countdown (`forceKillAfterMs`, default 5 s) expires | `SIGKILL` **[E14]**. |
| Nothing is running any more | Our handlers are removed; Node's default (die on Ctrl+C) returns **[E19]**. |

---

## 6. Edge-case catalog

Each entry: **Situation** (what happens in the real world) → **Naive result** (what simple code does) → **What we do** → **Verified by** (test in `spawn.test.ts`; "manual" = checked under a real pseudo-terminal).

### A. Starting the process

#### [E1] Starting the process throws immediately
* **Situation.** `spawn()` can throw *synchronously* (invalid options, or an injected `spawnImpl` that fails) before any process object exists.
* **Naive result.** Code that goes on to attach listeners to a non-existent child crashes, or leaves half-registered state behind.
* **What we do.** The call is wrapped in `try/catch`. We reject with `ProcessError(kind: "spawn-failed")`, keeping the original error as `cause`. This happens *before* we register signal handlers or timers, so there is nothing to clean up.
* **Verified by.** *capture mode › [E1]*.

#### [E2] One answer, many events
* **Situation.** A child can emit `error` **and** `close` (and `exit`), in sequence. A program that is not found emits `error`, then often `close` with code −2.
* **Naive result.** The Promise is resolved *and* rejected, or the first (meaningful) failure is overwritten by the later `close`.
* **What we do.** All resolving/rejecting goes through one function guarded by a `settled` flag. The first outcome wins; later events are ignored.
* **Verified by.** *fake child › [E2][E3]*.

#### [E3] Listeners and timers must not outlive the call
* **Situation.** (a) We keep an `error` listener on the child for its whole life. (b) We subscribe to signals and start timers.
* **Naive result.** (a) If the `error` listener is removed after the first error (`once`), a *second* error event has no listener and Node treats it as an unhandled error, **crashing the whole program**. (b) Forgotten signal handlers and timers accumulate in a long-running tool, and a forgotten SIGINT handler stops Ctrl+C from working.
* **What we do.** (a) `on("error")`, never `once`: it stays attached; the `settled` flag makes later errors harmless. (b) The single `settle` function unsubscribes from signals and clears both timers on **every** path: success, failure, early failure.
* **Verified by.** *signals › [E3]* (both tests: after success, after failed start); *fake child › [E2][E3]* (second error does not throw).

#### [E4] "Not found": the program, or the directory?
* **Situation.** Node reports `spawn pnpm ENOENT` both when the *program* does not exist **and** when the *working directory* does not exist.
* **Naive result.** The user hunts for a missing `pnpm` that is perfectly installed.
* **What we do.** On `ENOENT`, if a `cwd` was given and does not exist, the message says so: *"the working directory does not exist: …"*.
* **Verified by.** *capture mode › [E4]*.

### B. Output and finishing

#### [E5] A character cut in half
* **Situation.** A pipe delivers `€` as two bytes in one chunk and one byte in the next (§2.4).
* **Naive result.** `chunk.toString()` on each piece produces `�` characters.
* **What we do.** Capture mode stores **raw bytes** and decodes once at the end. Decorated mode uses one `StringDecoder` per stream, which remembers incomplete characters between chunks and flushes any final fragment at the end.
* **Verified by.** *capture mode › [E5]*; *LinePrefixer › [E5]*; fuzz test (every split point).

#### [E6] `error` does not always mean "it's over"
* **Situation.** Node's `error` event has two meanings (§2.10): the process never started, **or** it is running and a side operation failed (e.g. our `kill` attempt did not work).
* **Naive result.** Rejecting at once and removing our signal handling leaves a possibly-still-running child that nobody observes or controls.
* **What we do.** If the child has **no PID**, it never started → reject now (`spawn-failed`). If it **has a PID**, remember the error and **wait until the process really ended**, then reject with `process-error`.
* **Verified by.** *fake child › [E6]* (two tests).

#### [E7] A non-zero exit is data, not an exception
* **Situation.** `git diff --exit-code` exits `1` to mean "there are differences". Many tools use non-zero codes meaningfully.
* **Naive result.** Callers cannot distinguish "program said no" from "we failed to run it".
* **What we do.** `spawn` **resolves** with the code. Only the convenience helper turns non-zero into a `ProcessError` (`non-zero-exit`).
* **Verified by.** *capture mode › non-zero exit RESOLVES*.

#### [E8] Errors on the output pipes themselves
* **Situation.** A stdout/stderr stream emits `error` (rare, but possible).
* **Naive result.** No listener → uncaught exception → crash.
* **What we do.** Each stream has an `error` listener that records it as a post-start error (see E6).
* **Verified by.** Code inspection (cannot be provoked portably).

#### [E9] Data arriving after we have answered
* **Situation.** After we settle (e.g. after we forcibly closed the pipes), a late `data` event could still fire.
* **Naive result.** Writing to the user's terminal or growing buffers after the call is "over".
* **What we do.** `handleChunk` returns immediately when `settled`.
* **Verified by.** Code inspection.

#### [E10] A background process keeps the pipe open
* **Situation.** The child starts a background program (for example `sh -c "sleep 60 & echo hi"`) that inherits the output pipe. The child exits; the background program keeps the pipe open. `close` fires only when **all** holders close it: potentially minutes, or never.
* **Naive result.** Our Promise never resolves. The CLI hangs.
* **What we do.** We settle on `exit` **plus a grace period** (`1 s`) for the pipes to drain. If `close` has not arrived by then, we destroy the pipes ourselves and finalize. Output the lingering background process writes after that is dropped.
* **Verified by.** *capture mode › [E10]* (a `sleep 3 &` grandchild; returns in about 1 s).

#### [E11] Neither an exit code nor a signal
* **Situation.** Node gives `code = null` and an unknown or missing signal.
* **Naive result.** `null` leaks to callers, and `if (code !== 0)` is `true` for `null`, but arithmetic and comparisons misbehave.
* **What we do.** We always return a number: `1` as the last fallback.
* **Verified by.** Code inspection (cannot be provoked portably).

#### [E12] Simple test doubles
* **Situation.** Tests inject a fake child that emits strings instead of Buffers and has no PID.
* **What we do.** String chunks are converted to Buffers; "no PID" is treated as "never started" (E6).
* **Verified by.** *fake child › [E5] string chunks*.

### C. Exit codes and signals

#### [E13] A program killed by a signal has no exit code
* **Situation.** The user pressed Ctrl+C, or something ran `kill`, so the program never chose a number (§2.5, §2.6).
* **Naive result.** Always reporting `1` makes "the program crashed" and "the user cancelled" indistinguishable; a wrapper script cannot tell Ctrl+C from failure.
* **What we do.** `code = 128 + signal number`: `SIGINT` → 130, `SIGTERM` → 143, `SIGKILL` → 137. The original signal name is *also* returned in `signal`. If the CLI ends with `process.exit(result.code)`, scripts around it see the standard codes.
* **Verified by.** *capture mode › [E13]*, *signals › force-kill (137)*, *helper › [E13]*.

#### [E14] A child that will not stop
* **Situation.** Once we handle signals, Node no longer dies on Ctrl+C by itself (§2.7). A child that ignores `SIGTERM` or hangs during cleanup would make the whole CLI un-interruptible.
* **Naive result.** The user presses Ctrl+C repeatedly and nothing happens; they have to open another terminal and `kill -9`.
* **What we do.** On the first signal we start a countdown (`forceKillAfterMs`, default 5 s) and then send `SIGKILL`. A **second** signal of any kind sends `SIGKILL` **immediately**: the user has clearly lost patience. The same countdown protects the output-limit stop (E22).
* **Trade-off.** A legitimately slow cleanup longer than the countdown is cut off. Tune `forceKillAfterMs` per call.
* **Verified by.** *signals › [E14]* (three tests: forwarded, countdown, second signal); *manual: terminal-attached SIGINT ends with 137*.

#### [E15] Ctrl+C reaches the child twice
* **Situation.** In a terminal the *terminal itself* delivers Ctrl+C to parent **and** child (§2.7). If we forward it as well, the child gets two.
* **Naive result.** Many tools interpret a second Ctrl+C as "abort without cleaning up". A graceful shutdown becomes a rough one (half-written files, lockfiles left behind).
* **What we do.** If **any** of stdin/stdout/stderr is a terminal, we assume a human pressed Ctrl+C: we do **not** forward `SIGINT`, but we still wait for the child (and start the countdown). With no terminal (CI, scripts, `kill -INT <pid>`), nobody else will tell the child, so we **do** forward it.
* **Verified by.** *signals › [E15]* (non-terminal: forwarded); *manual under a pseudo-terminal: child did not see SIGINT, ended 137*.

#### [E16] Many children at once
* **Situation.** `Promise.all` starts 25 children.
* **Naive result.** Each adds its own `process.on("SIGINT", …)`. Node warns `MaxListenersExceededWarning` after 10.
* **What we do.** One module-level registry holds **one** real listener per signal, installed when the first child starts and removed when the last ends; it hands each signal to every running child.
* **Verified by.** *signals › [E16]* (25 concurrent children; no warning; listeners back to zero).

#### [E17] `SIGTERM` and `SIGHUP` must reach the child
* **Situation.** `kill <our-pid>`, `docker stop`, a CI cancel, or closing the terminal window signals **only us**.
* **Naive result.** We die (or wait), and the child is orphaned: still running, still holding locks.
* **What we do.** Both are always forwarded.
* **Verified by.** *signals › [E14] SIGTERM forwarded*.

#### [E18] A signal arrives after the child has ended
* **Situation.** The child finished a moment ago; a signal arrives before we finish cleaning up.
* **Naive result.** Killing a PID that no longer exists, or worse, one the OS has reused.
* **What we do.** `kill()` on an ended Node child object is a harmless no-op that returns `false`; and once we have settled we are no longer subscribed.
* **Verified by.** Code inspection.

#### [E19] Ctrl+C works normally again when idle
* **Situation.** After the last child ends, nothing should still be intercepting signals.
* **What we do.** The shared listener is removed when the count reaches zero; Node's default "die on Ctrl+C" returns.
* **Verified by.** *signals › [E3]* and *[E16]* (listener counts return to the baseline).

#### [E20] Signals go to the child, not to its children
* **Situation.** `pnpm run build` starts `tsc`, which starts workers.
* **What we do.** We signal the process we started. Well-behaved tools pass signals on to their own children. A full process-tree kill is a **non-goal** (§8).

#### [E21] The module never exits the program
* **Guarantee.** `spawn` only *reports* how the child ended. It never calls `process.exit()`. Where the CLI ends, which code it uses, and what cleanup it runs first are the caller's decisions.

### D. Capture mode

#### [E22] Unbounded output
* **Situation.** A command prints gigabytes (`yes`, a runaway log, `cat` on a huge file).
* **Naive result.** We keep everything in memory until the process runs out of it.
* **What we do.** `maxBuffer` (default **10 MiB per stream**). On exceeding it we stop the child (`SIGTERM`, then `SIGKILL` after the countdown) and reject with `ProcessError(kind: "output-limit")`, carrying what was captured up to the limit.
* **Verified by.** *capture mode › [E22]*.

#### [E23] After the limit
* **What we do.** The chunk that crosses the limit is dropped, and all later chunks are ignored while the child is being stopped. We reject only after the child **really ended**, so we never leave a runaway process behind.
* **Verified by.** *capture mode › [E22]* (child is actually stopped, within seconds).

#### [E24] The two streams are counted separately
* **What we do.** stdout and stderr each have their own byte count against `maxBuffer`.

#### [E25] Order between stdout and stderr is not recorded
* **Situation.** The two streams arrive through different pipes at different times.
* **What we do.** They are returned as two separate strings; their interleaving is **not** reconstructed. (Limitation; see §8.)

#### [E26] `trim()` eats meaningful leading whitespace
* **Situation.** `git status --porcelain` prints ` M src/file.ts`: the leading space is data (it says "unstaged").
* **Naive result.** `.trim()` removes it and the first line is parsed wrongly.
* **What we do.** The helper uses `trimEnd()`: trailing newlines are removed, leading whitespace is kept.
* **Verified by.** *helper › [E26]*.

### E. Decorated mode (`│ ` prefix)

> **Worked example.** The child prints `Installing…\n`, then a progress line that redraws itself (`10%\r20%\r30%\n`), then a prompt with no newline (`Continue? (y/n) `). The user sees:
> ```
> │ Installing…
> │ 10%␍│ 20%␍│ 30%
> │ Continue? (y/n) █
> ```
> The prompt is visible immediately, and the progress line still redraws in place, each redraw re-printing its prefix.

#### [E27] Output is shown, not stored
* **What we do.** In Decorated mode nothing is retained (no `stdout`/`stderr` strings). The result type (`ExitResult`) has no output fields, so the compiler prevents callers from reading output that does not exist. A long interactive run cannot grow memory.
* **Verified by.** *decorated mode › [E27]* (run as a real subprocess and the bytes inspected).

#### [E28] Line endings, and endings cut in half
* **Situation.** A child may use `\n`, or Windows-style `\r\n`. The `\r` can end one chunk and the `\n` start the next.
* **Naive result.** Treating a lone `\r` as "line end" creates a phantom empty line when `\n` follows in the next chunk.
* **What we do.** The prefixer keeps a **cursor state** across chunks: *fresh* (start of a new line), *returned* (cursor jumped back to column 1 of a line with content: after `\r`), *inside* (mid-line). A `\n` after a `\r` does **not** produce a prefix. Blank lines in a fresh position **do** get one so the bar `│` is unbroken. Line endings are passed through unchanged, never rewritten.
* **Verified by.** *LinePrefixer › [E28]*, blank-line test, fuzz test.

#### [E29] Prompts without a trailing newline
* **Situation.** `Continue? (y/n) ` ends without `\n`, and the child now waits for the user.
* **Naive result.** If we only print complete lines, the prompt never appears: the program looks frozen while it waits for an answer nobody knows to give.
* **What we do.** We **never wait for a newline**. Every chunk is transformed and printed immediately.
* **Verified by.** *LinePrefixer › [E29]*.

#### [E30] Never cut a terminal command in half
* **Situation.** `␛[31m` (red) must reach the terminal intact. If we inserted `│ ` between `␛[3` and `1m`, the terminal would receive garbage and print stray characters. Sequences can also be split across chunks, or be malformed.
* **What we do.** A small state machine follows escape sequences (`ESC [ … final` colors/cursor; `ESC ] … BEL/ST` titles/links; short two-character ones; ones with intermediate bytes such as `ESC ( B`). A prefix is **only** inserted at a plain visible character, never inside a sequence. An unfinished sequence at the end of a chunk is *held until it completes* (and flushed on `end()`); a malformed one is abandoned without swallowing later text.
* **Verified by.** *LinePrefixer › [E30]* (five tests); fuzz test; "pure pass-through" test (removing every `│ ` yields exactly the original text).

#### [E31] Cursor movement, redraws and colors
* **Situation.** Spinners and progress UIs *redraw*: return to column 1 (`\r` or `␛[G`), erase (`␛[2K`), go up (`␛[1A`), print again. Colored lines begin with a color command.
* **Naive result.** (a) A prefix printed *before* an erase command is erased with it. (b) A prefix printed *after* a color command is colored, giving a bar that changes color with every line.
* **What we do.**
  * After the cursor returns to column 1 (`\r`, `␛[G`, `␛[E`, `␛[F`), the prefix is re-printed before the next visible character, because the redraw overwrote the old one.
  * The prefix goes right before the first **visible** character, i.e. *after* erase/cursor commands, so erasing cannot wipe it.
  * **Color** commands (`␛[…m`) are the exception: they change nothing about cursor position, so they are held back and printed *right after* the prefix. The bar keeps its own color. (They are released at the end of each chunk at the latest, so a color reset can never be delayed meaningfully.)
  * Everything is passed through **unchanged**; we only ever *add* prefixes.
* **Verified by.** *LinePrefixer › [E31]* (five tests); fuzz test.

#### [E32] The child ends mid-line
* **Situation.** The child printed a prompt, and was then killed, or just exited.
* **Naive result.** Whatever the parent prints next is glued onto the child's last line.
* **What we do.** At the end of the stream, if the cursor is mid-line, we print one newline.
* **Verified by.** *LinePrefixer › [E32]*; *decorated mode › [E27]* (stderr `oops` ends with a newline).

#### [E33] Colors: respect the user's wishes
* **Situation.** Piping the child's output makes it disable colors (§2.8). We ask for colors back with `FORCE_COLOR=1`: but the user may have said otherwise (`FORCE_COLOR=0`, or the standard `NO_COLOR`).
* **Naive result.** Overriding the user's explicit choice.
* **What we do.** We default `FORCE_COLOR=1` only in Decorated mode, only when our stdout is a terminal, and only if neither `FORCE_COLOR` nor a non-empty `NO_COLOR` is already set (including in the caller's `env`).
* **Verified by.** *manual under a pseudo-terminal*: default → `1`; `FORCE_COLOR=0` → `0`; `NO_COLOR=1` → unset.

#### [E34] What the prefix cannot do
* **Situation.** Full-screen programs (`vim`, `htop`: they switch to an "alternate screen" and position the cursor absolutely) and programs that fill the exact terminal width.
* **What we do.** Documented limitation. The prefix takes two columns the child does not know about, so a line that was exactly as wide as the terminal now wraps, and a program that counts lines to move the cursor back up can be off by one. Use Pass-through mode for such programs.

### F. The error API

#### [E35] Only real bugs are thrown
* **What we do.** The helper catches only `ProcessError`. A bug, such as your own `onExit` callback throwing, propagates instead of being disguised as a "process failed" tuple.
* **Verified by.** *helper › a throwing onExit*.

#### [E36] One error channel
* **Naive result.** (Old behavior.) "Could not start" **threw**, while "exited non-zero" came back in a tuple, so every caller needed both `try/catch` and a tuple check.
* **What we do.** The helper returns every failure in the tuple.
* **Verified by.** *helper › [E36]* (two tests).

#### [E37] Structured errors
* **What we do.** `ProcessError` carries `kind`, `code`, `signal`, `stdout`, `stderr`, `command`, `args`, `cause`, so callers can *inspect*, not parse message text.
* **Verified by.** *helper › [E36] non-zero exit … structured fields*.

#### [E38] Messages are safe to log
* **Situation.** Arguments often contain secrets (`--token abc123`), and error messages end up in logs and bug reports. Stderr can be megabytes.
* **What we do.** Messages contain the command name but **never the arguments** (they are on `error.args`). At most the last 4000 characters of stderr go in the message (with `…` when cut); the whole text is on `error.stderr`.
* **Verified by.** *helper › [E38]*, *helper › long stderr is truncated*.

---

## 7. Decision log

### Decisions you made (from the review round)

| # | Question | Decision | Where it shows up |
|---|---|---|---|
| Q1 | Signal policy | Forward `SIGTERM`/`SIGHUP` always; forward `SIGINT` only with no terminal attached; force-kill after 5 s or on a second signal. Explained "for dummies" in the code. | E14–E17; the long comment above `FORWARDED_SIGNALS` |
| Q2 | Exit code on signal death | `128 + signal number`; `signal` still returned. Explained "for dummies" in the code. | E13; the long comment above `normalizeExitCode` |
| Q3 | Output retention | Decorated mode retains nothing (and the type says so). Capture mode gets `maxBuffer`. | E22–E24, E27 |
| Q4 | Error channels | One channel in the helper (the tuple); structured `ProcessError`; no `args` in messages. | E35–E38 |
| Q5 | Decorated display (commands use **cursor movement and prompts**) | Stream immediately; never wait for newlines; understand escape sequences so the prefix is never inserted inside one; re-print the prefix after a redraw. | E28–E32 |
| Q6 | Windows | Out of scope for now. | §3, §8 |

Your answer to Q5 mattered: the first idea ("pass `\r` through and re-emit the prefix") is not enough once programs use cursor movement, because a prefix that lands before an *erase* command is erased with it. That is why the prefixer is an escape-sequence-aware state machine instead of a line splitter.

### Decisions I made while implementing (please review)

| # | Decision | Why |
|---|---|---|
| D1 | **Widened Q1's terminal test:** "a terminal is attached" means *any* of stdin, stdout, stderr is a terminal (was: stdin). | `tool < input.txt` typed in a terminal still delivers Ctrl+C to the whole process group even though stdin is a file. |
| D2 | **Kept the public option shape** (`stdin` + `stdout`), typed with overloads, instead of switching to `mode: "capture" \| "interactive"`. | There are callers of `spawn` I cannot see; a type-level change that makes the compiler flag misuse seemed safer than an API rename. Moving to `mode` later is mechanical. |
| D3 | **Color commands are held until after the prefix**; all other escape sequences pass before it. | Keeps the bar uncolored (as in the previous version) without letting erase commands wipe it. |
| D4 | **A newline is added if the child stops mid-line** (previous version also flushed a partial line with a newline). | Prevents glued-together terminal lines. |
| D5 | **Defaults:** `maxBuffer` 10 MiB per stream; `forceKillAfterMs` 5 s; pipe-drain grace 1 s; 4000 stderr characters in messages. | Generous enough for normal use, small enough to protect against runaways. Easy to change. |
| D6 | **Exceeding `maxBuffer` rejects** instead of silently truncating. | Silent truncation would give callers corrupt-looking data with no signal that anything is wrong. |
| D7 | **`process-error`**: an `error` after the process started waits for the real end before rejecting. | Avoids an unobserved, still-running child (E6). |
| D8 | **`onExit` only fires when there is a result.** | There is nothing to report for "could not start" or "output limit". |
| D9 | **Line endings pass through unchanged** (the previous version rewrote them to `\n` or `\r\n` by platform). | Rewriting is unnecessary on every platform and would corrupt `\r` redraws. |
| D10 | **Prefixer state is per stream** (stdout and stderr each have their own). | The two streams may go to different destinations; each stays internally consistent. |

---

## 8. Known limitations

| # | Limitation | Consequence / advice |
|---|---|---|
| L1 | **Windows** is not supported or tested. | `pnpm` is `pnpm.cmd` there (starting it without a shell fails), signals work differently, etc. |
| L2 | **Process trees.** Only the child we started is signalled (E20). | Programs that start further programs are expected to pass signals on. |
| L3 | **Full-screen programs and exact-width output** in Decorated mode (E34). | Use Pass-through for `vim`, `htop`, installers drawing full-width bars. |
| L4 | **Closed parent output (`EPIPE`)** is not handled. If our own stdout is closed (e.g. `tool \| head`), `process.stdout` emits an `error`. | The application should install its own handler on `process.stdout`; a library function must not decide to exit. |
| L5 | **No back-pressure** when writing to the parent's stdout in Decorated mode. | Interactive volumes are small. If output were huge and the terminal slow, Node would buffer it in memory. |
| L6 | **No timeouts, `AbortSignal`, or stdin input.** | Add when a caller needs them. |
| L7 | **Capture mode does not preserve the interleaving** of stdout and stderr (E25). | Two separate strings. |
| L8 | **A hyperlink or window-title command (`ESC ]`) at the very start of a line** puts the prefix *inside* the link/title region. | Cosmetic only. Only color commands are re-ordered. |
| L9 | **Output of a lingering background process after the pipe grace period** is dropped (E10). | By design: waiting forever is worse. |
| L10 | **A cleanup slower than `forceKillAfterMs`** after a signal is cut off with `SIGKILL` (E14). | Raise the option for programs that need longer. |

---

## 9. Differences from the previous version

These are behavior changes callers may notice.

| Area | Before | Now |
|---|---|---|
| Result type in Decorated/Pass-through | `{ code, signal, stdout, stderr }` with empty strings | `{ code, signal }`: reading `result.stdout` there is now a **compile error** (this is intentional, E27). |
| Exit code after a signal | `1` | `128 + signal number` (`signal` unchanged). |
| Rejections of `spawn` | The raw Node error | `ProcessError` (`cause` holds the raw error). |
| Helper: could not start | **Threw** | Returned in the tuple. |
| Helper: message | `cmd arg1 arg2 exited with 2` | `cmd exited with code 2` (no args), plus the last 4000 chars of stderr. |
| Helper: returned text | `.trim()` | `.trimEnd()`. |
| Helper: huge output | Unbounded | Rejects at 10 MiB per stream (`output-limit`). |
| Signals handled | `SIGINT`, `SIGTERM` (all forwarded) | Adds `SIGHUP`; `SIGINT` not forwarded when a terminal is attached; force-kill after 5 s / on a second signal; one shared listener. |
| `error` after the process started | Rejected immediately | Waits until the process ended, then rejects (`process-error`). |
| Background process holding the pipe | Could hang forever | Returns about 1 s after the child exits. |
| `FORCE_COLOR` | Always overrode the user's setting | Only defaulted when the user said nothing. |
| Decorated display | Waited for a newline; normalized line endings; split `\r\n` across chunks produced a blank line; a prefix could land inside escape sequences | Streams immediately, passes bytes through unchanged, escape-sequence-aware (E28–E32). |
| Platform branches (`win32 ? "\r\n" : "\n"`) | 3 copies | Removed. |

---

## 10. Verification

**Automated** (`spawn.test.ts`, 50 tests; uses Node's built-in test runner through `tsx`, using **real** child processes wherever possible):

```bash
npm i -D typescript tsx @types/node
npx tsc --noEmit                   # strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess
npx tsx --test spawn.test.ts
```

| Group | Tests | Edge cases |
|---|---|---|
| `LinePrefixer` | 20 + a fuzz test that cuts nine tricky inputs at **every** byte offset and checks that content and prefix count never change | E5, E28–E32 |
| Capture mode | 8 (incl. a `sleep &` grandchild and a runaway printer) | E1, E4, E5, E7, E10, E13, E22, E23 |
| Signals | 7 (real child processes; 25 concurrent) | E3, E14–E17, E19 |
| Fake children | 4 | E2, E3, E5, E6, E12 |
| Decorated mode | 1 (a real subprocess; the bytes it wrote are inspected) | E27, E32 |
| Helper | 8 | E13, E26, E35–E38 |

**Manual** (cannot run without a terminal; done with `script -qec … /dev/null`, which provides a real pseudo-terminal; script: `tty-demo.ts`):

| Check | Expected | Result |
|---|---|---|
| `SIGINT` while a terminal is attached | Child does **not** see it; force-killed after the countdown → `code 137`, `signal SIGKILL` | ✔ |
| Decorated mode on a terminal, no color variables set | Child sees `FORCE_COLOR=1` | ✔ |
| Same, with `FORCE_COLOR=0` | Child sees `FORCE_COLOR=0` | ✔ |
| Same, with `NO_COLOR=1` | `FORCE_COLOR` stays unset | ✔ |

**Not covered by any test, by honesty:** E8, E9, E11, E18 (cannot be provoked portably; verified by inspection), and real-world rendering of a specific tool's progress UI (for example `pnpm install` with its reporter). Run your real commands in Decorated mode once and look at the screen.
