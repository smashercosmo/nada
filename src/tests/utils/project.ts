import {cleanup, render} from "cli-testing-library"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import url from "node:url"

import type {ReadonlyDeep} from "#lib/types.js"

interface PackageJson {
  name: string,
  private: boolean,
  version: string,
  engines: {
    node: string,
    pnpm: string
  },
}

export class TestProject {
  /**
   * Project name. Can be any string.
   * Used to created tmp directories with
   * human-readable name for easier debugging.
   *
   * @private
   */
  readonly #name: string = ""
  readonly #programFilePath: string = TestProject.#relativeToAbsoluteFilePath("#src/index.js")
  /**
   * Tmp directory against which
   * we're gonna execute our CLI tpol commands
   * (awnswering questions, installing projects, etc...)
   *
   * @private
   */
  #directory = ""

  readonly #packageJson: PackageJson

  static #relativeToAbsoluteFilePath(filePath: string) {
    return url.fileURLToPath(import.meta.resolve(filePath.trim()))
  }

  static #jsonStringifyFormatted(
    obj: ReadonlyDeep<PackageJson>,
  ) {
    const SPACE_SYMBOLS_NUMBER_TO_INDENT_BY = 2
    return JSON.stringify(obj, undefined, SPACE_SYMBOLS_NUMBER_TO_INDENT_BY)
  }

  async #addPackageJsonFile({ directory }: Readonly<{ directory: string }>) {
    await fs.writeFile(
      path.join(directory, "package.json"),
      `${TestProject.#jsonStringifyFormatted(this.#packageJson)}${os.EOL}`,
    )
  }

  public constructor({
    name,
    programFilePath,
  }: Readonly<{
    name: string
    programFilePath?: string
  }>) {
    this.#name = name.trim()
    this.#packageJson = {
      name: this.#name,
      private: true,
      version: "1.0.0",
      engines: {
        node: ">=24.0.0",
        pnpm: ">=11.0.0"
      }
    }
    this.#programFilePath =
      programFilePath === undefined
        ? this.#programFilePath
        : TestProject.#relativeToAbsoluteFilePath(programFilePath)
  }

  public async create() {
    if (!this.#name) {
      throw new Error("Project name has not been provided.")
    }

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `${this.#name}-`))
    await this.#addPackageJsonFile({ directory })
    this.#directory = directory
    return this
  }

  public async cleanup() {
    await cleanup()
    await fs.rm(this.#directory, {
      recursive: true,
      force: true,
    })
  }

  public async run(
    options?: ReadonlyDeep<{
      args?: string[]
    }>,
  ) {
    const { args = [] } = options ?? {}
    return await render(process.execPath, [this.#programFilePath, ...args], {
      cwd: this.#directory,
      spawnOpts: {
        env: {
          ...process.env,
          NADA_DISABLE_GUIDE_LINES: "true",
        },
      },
    })
  }
}
