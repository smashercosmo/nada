import os from "node:os"

export function formatError({ error, details }: { error: unknown; details?: string }) {
  const lines = [];
  const isVerbose = process.env.NADA_REPORTER === "verbose";

  if (error instanceof Error) {
    lines.push(`Message: ${error.message}`);

    if (isVerbose && error.stack) {
      const stackLines = error.stack.split(os.EOL).slice(1);
      for (const line of stackLines) {
        const trimmed = line.trim();
        if (trimmed) {
          lines.push(`Stack: ${trimmed}`);
        }
      }
    }
  } else if (error != null) {
    lines.push(`Message: ${String(error)}`);
  }

  if (details) {
    lines.push(`Additional details: ${details}`);
  }

  return lines.join(os.EOL);
}
