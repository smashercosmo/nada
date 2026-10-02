import { spawn } from "node:child_process"
import process from "node:process"

export interface PnpmResult {
  code: number
  stdout: string
  stderr: string
  /** stdout and stderr interleaved in arrival order. */
  output: string
}

export interface RunPnpmOptions {
  cwd: string
  /**
   * - "capture": stdin is closed (so pnpm fails fast instead of waiting for input
   *   nobody can see) and stdout/stderr are collected.
   * - "inherit": the terminal is handed over to pnpm (interactive commands).
   */
  mode: "capture" | "inherit"
  /** In "capture" mode, also forward pnpm's output to the terminal (debugging). */
  echo?: boolean
}

export function runPnpm(args: readonly string[], options: RunPnpmOptions): Promise<PnpmResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", [...args], {
      cwd: options.cwd,
      stdio: options.mode === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let output = ""

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      output += text
      if (options.echo) process.stdout.write(text)
    })

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      output += text
      if (options.echo) process.stderr.write(text)
    })

    child.on("error", reject)
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr, output })
    })
  })
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001B\[[0-9;?]*[ -/]*[@-~]/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "")
}

/** Last non-empty lines of pnpm output, for error reporting. */
export function tailLines(output: string, count = 12): string[] {
  return stripAnsi(output)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .slice(-count)
}
