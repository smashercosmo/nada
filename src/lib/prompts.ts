import type { CANCEL_SYMBOL } from "@clack/prompts"

import { cancel, isCancel } from "@clack/prompts"
import process from "node:process"

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
