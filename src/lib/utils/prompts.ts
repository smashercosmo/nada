import type { CANCEL_SYMBOL } from "@clack/prompts"

import { cancel, isCancel } from "@clack/prompts"
import process from "node:process"

import { EXIT_CODE_CANCELLED } from "#lib/utils/constants.js"

/**
 * Unwraps a clack prompt result. If the user canceled (Ctrl+C), the CLI exits
 * right away with a non-zero code. Nothing is installed before all prompts
 * have been answered, so cancelling never leaves a partial installation behind.
 */
export function unwrap<T extends unknown>(value: T | typeof CANCEL_SYMBOL) {
  if (isCancel(value)) {
    cancel("Operation cancelled.")
    process.exit(EXIT_CODE_CANCELLED)
  }
  return value
}
