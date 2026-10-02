import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { readConfig, updateConfig } from "#lib/utils/config.js"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nadarc-test-"))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** Writes a file named `name` in `dir` with the given (already-stringified) content. */
function writeFile(dir: string, name: string, content: string) {
  return fs.writeFile(path.join(dir, name), content, "utf8")
}

function writeRc(dir: string, content: string) {
  return writeFile(dir, ".nadarc.json", content)
}

function readRc(dir: string) {
  return fs.readFile(path.join(dir, ".nadarc.json"), "utf8")
}

const formatted = (value: unknown) => `${JSON.stringify(value, null, 2)}${os.EOL}`

describe("config test suite", () => {
  describe("read config", () => {
    it("returns exists: false and an empty config when no rc file is present", async () => {
      await expect(readConfig(tmpDir)).resolves.toEqual({ exists: false, config: {} })
    })

    it("reads a valid .nadarc.json file", async () => {
      await writeRc(tmpDir, JSON.stringify({ debug: true, saveTypes: false }))

      await expect(readConfig(tmpDir)).resolves.toEqual({
        exists: true,
        config: { debug: true, saveTypes: false },
      })
    })

    it("reads all supported settings", async () => {
      const all = { saveTypes: true, saveTypesCatalog: false, debug: true }
      await writeRc(tmpDir, JSON.stringify(all))

      await expect(readConfig(tmpDir)).resolves.toEqual({ exists: true, config: all })
    })

    it("passes through unknown/extra properties without validation", async () => {
      await writeRc(tmpDir, JSON.stringify({ debug: true, notInTheType: 42 }))

      const { config } = await readConfig(tmpDir)
      expect(config).toEqual({ debug: true, notInTheType: 42 })
    })

    it("returns exists: true with an empty config for malformed JSON", async () => {
      await writeRc(tmpDir, "{ not valid json")

      await expect(readConfig(tmpDir)).resolves.toEqual({ exists: true, config: {} })
    })

    it("returns exists: true with an empty config for an empty file", async () => {
      await writeRc(tmpDir, "")

      await expect(readConfig(tmpDir)).resolves.toEqual({ exists: true, config: {} })
    })

    it("reports exists: true with an empty config when the path can't be read as a file", async () => {
      // A directory named .nadarc.json makes readFile fail with EISDIR (not ENOENT).
      await fs.mkdir(path.join(tmpDir, ".nadarc.json"))

      await expect(readConfig(tmpDir)).resolves.toEqual({ exists: true, config: {} })
    })

    it("reports exists: false when cwd is a file rather than a directory (ENOTDIR)", async () => {
      await writeFile(tmpDir, "not-a-dir", "hello")

      await expect(readConfig(path.join(tmpDir, "not-a-dir"))).resolves.toEqual({
        exists: false,
        config: {},
      })
    })

    it("reports exists: false when cwd doesn't exist (ENOENT)", async () => {
      await expect(readConfig(path.join(tmpDir, "nope"))).resolves.toEqual({
        exists: false,
        config: {},
      })
    })

    it("only looks in the given directory", async () => {
      const other = path.join(tmpDir, "other")
      await fs.mkdir(other)
      await writeRc(other, JSON.stringify({ debug: true }))

      await expect(readConfig(tmpDir)).resolves.toEqual({ exists: false, config: {} })
      await expect(readConfig(other)).resolves.toEqual({ exists: true, config: { debug: true } })
    })

    it("picks up changes on disk between calls (no caching)", async () => {
      await writeRc(tmpDir, JSON.stringify({ debug: false }))
      await readConfig(tmpDir)
      await writeRc(tmpDir, JSON.stringify({ debug: true }))

      await expect(readConfig(tmpDir)).resolves.toEqual({ exists: true, config: { debug: true } })
    })

    it("uses process.cwd() when no cwd argument is given", async () => {
      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir)
      await writeRc(tmpDir, JSON.stringify({ debug: true }))

      await expect(readConfig()).resolves.toEqual({ exists: true, config: { debug: true } })
      expect(cwdSpy).toHaveBeenCalled()
    })
  })
  describe("update config", () => {
    it("creates .nadarc.json when no config file exists yet", async () => {
      const result = await updateConfig(tmpDir, { debug: true })

      expect(result).toEqual({
        created: true,
        filePath: path.join(tmpDir, ".nadarc.json"),
      })
      await expect(readRc(tmpDir)).resolves.toBe(formatted({ debug: true }))
    })

    it("pretty-prints with 2-space indentation and a trailing OS EOL", async () => {
      await updateConfig(tmpDir, { debug: true, saveTypes: false })

      const content = await readRc(tmpDir)
      expect(content.endsWith(os.EOL)).toBe(true)
      expect(content).toBe(formatted({ debug: true, saveTypes: false }))
    })

    it("merges updates into an existing config, with updates taking priority", async () => {
      await writeRc(tmpDir, JSON.stringify({ saveTypes: true, debug: false }))

      const result = await updateConfig(tmpDir, { debug: true })

      expect(result).toEqual({ created: false, filePath: path.join(tmpDir, ".nadarc.json") })
      await expect(readConfig(tmpDir)).resolves.toEqual({
        exists: true,
        config: { saveTypes: true, debug: true },
      })
    })

    it("preserves unknown existing properties", async () => {
      await writeRc(tmpDir, JSON.stringify({ custom: "keep me" }))

      await updateConfig(tmpDir, { debug: true })

      const { config } = await readConfig(tmpDir)
      expect(config).toEqual({ custom: "keep me", debug: true })
    })

    it("reports created: true only for the first write", async () => {
      const first = await updateConfig(tmpDir, { debug: true })
      const second = await updateConfig(tmpDir, { saveTypes: true })

      expect(first.created).toBe(true)
      expect(second.created).toBe(false)
      const { config } = await readConfig(tmpDir)
      expect(config).toEqual({ debug: true, saveTypes: true })
    })

    it("rewrites the existing content unchanged when updates is empty", async () => {
      await writeRc(tmpDir, JSON.stringify({ debug: true }))

      const result = await updateConfig(tmpDir, {})

      expect(result.created).toBe(false)
      await expect(readRc(tmpDir)).resolves.toBe(formatted({ debug: true }))
    })

    it("overwrites a malformed existing file with just the updates", async () => {
      await writeRc(tmpDir, "{ not valid json")

      const result = await updateConfig(tmpDir, { debug: true })

      // the file existed, so it's an update, not a creation
      expect(result.created).toBe(false)
      await expect(readRc(tmpDir)).resolves.toBe(formatted({ debug: true }))
    })

    it("uses process.cwd() when no cwd argument is given", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tmpDir)

      await updateConfig(undefined, { debug: true })

      await expect(readRc(tmpDir)).resolves.toBe(formatted({ debug: true }))
    })

    it("returns created: false and filePath: undefined, and logs an error, when the directory doesn't exist", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const missingDir = path.join(tmpDir, "does", "not", "exist")

      const result = await updateConfig(missingDir, { debug: true })

      expect(result).toEqual({ created: false, filePath: undefined })
      expect(errorSpy).toHaveBeenCalledWith("Config file could not be updated or created.")
    })

    it("returns created: false and filePath: undefined when cwd is a file rather than a directory", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      await writeFile(tmpDir, "not-a-dir", "hello")

      const result = await updateConfig(path.join(tmpDir, "not-a-dir"), { debug: true })

      expect(result).toEqual({ created: false, filePath: undefined })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it("returns created: false and filePath: undefined when the config path is a directory", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      await fs.mkdir(path.join(tmpDir, ".nadarc.json"))

      const result = await updateConfig(tmpDir, { debug: true })

      expect(result).toEqual({ created: false, filePath: undefined })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })
  })
})
