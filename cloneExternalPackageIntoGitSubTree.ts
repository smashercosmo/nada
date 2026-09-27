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

if (prefix && repo) {
  child_process.execFileSync("git", ["subtree", "add", `--prefix=${prefix}`, repo, "main", "--squash"])
  child_process.execFileSync("git", ["subtree", "pull", `--prefix=${prefix}`, repo, "main", "--squash"])
}
