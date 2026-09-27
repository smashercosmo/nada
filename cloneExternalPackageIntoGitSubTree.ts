#!/usr/bin/env node
import util from 'node:util';
import child_process from 'node:child_process';

const options = {
  'prefix': { type: 'string' },
  'repo': { type: 'string' },
} as const;

const { values, tokens } = util.parseArgs({ options, tokens: true });

// Reprocess the option tokens and overwrite the returned values.
tokens
  .filter((token) => token.kind === 'option')
  .forEach((token) => {
      values[token.name] = token.value;
  });

const prefix = values.prefix;
const repo = values.repo;

child_process.execFileSync("git", ["subtree", "pull", `--prefix=repos/pnpm`, "https://github.com/pnpm/pnpm.git", "v12.7.0", "--squash"])
child_process.execFileSync("git", ["subtree", "add", `--prefix=repos/pnpm.io`, "https://github.com/pnpm/pnpm.io.git", "main", "--squash"])
child_process.execFileSync("git", ["subtree", "pull", `--prefix=repos/pnpm.io`, "https://github.com/pnpm/pnpm.io.git", "main", "--squash"])
child_process.execFileSync("git", ["subtree", "add", `--prefix=repos/node`, "https://github.com/nodejs/node.git", "v26.10.0", "--squash"])
child_process.execFileSync("git", ["subtree", "pull", `--prefix=repos/node`, "https://github.com/nodejs/node.git", "v26.10.0", "--squash"])
child_process.execFileSync("git", ["subtree", "add", `--prefix=repos/pnpm.io`, "https://github.com/nodejs/nodejs.org.git", "main", "--squash"])
child_process.execFileSync("git", ["subtree", "pull", `--prefix=repos/pnpm.io`, "https://github.com/nodejs/nodejs.org.git", "main", "--squash"])

