import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import process from "node:process"

export const CONFIG_FILENAME = ".nadarc.json" as const

/** Error codes meaning "there is no config file at this path". */
const MISSING_FILE_CODES = new Set(["ENOENT", "ENOTDIR"])

type Config = {
  saveTypes?: boolean
  saveTypesCatalog?: string
  debug?: boolean
  catalogs?: boolean
}

/**
 * Reads configuration from the `.nadarc.json` file if it exists.
 */
async function readConfig(cwd: string = process.cwd()): Promise<{ exists: boolean; config: Config }> {
  const configPath = path.join(cwd, CONFIG_FILENAME)

  let content: string
  try {
    content = await fs.readFile(configPath, "utf8")
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    const missing = code !== undefined && MISSING_FILE_CODES.has(code)
    return { exists: !missing, config: {} }
  }

  try {
    return { exists: true, config: JSON.parse(content) }
  } catch {
    return { exists: true, config: {} }
  }
}

/**
 * Saves or updates settings in nada's existing configuration file
 * or in case it doesn't exist, creates a new one.
 */
async function updateConfig(
  cwd: string = process.cwd(),
  updates: Partial<Config>,
) {
  const configPath = path.join(cwd, CONFIG_FILENAME)
  const { exists, config } = await readConfig(cwd)
  try {
    await fs.writeFile(configPath, `${JSON.stringify({ ...config, ...updates }, null, 2)}${os.EOL}`, "utf8")
    return { created: !exists, filePath: configPath }
  } catch {
    console.error("Config file could not be updated or created.")
    return { created: false, filePath: undefined }
  }
}

export { readConfig, updateConfig }
