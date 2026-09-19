#!/usr/bin/env node
import * as p from "@clack/prompts";
import child_process from "child_process";
import os from "node:os";
import process from "node:process";
import readline from 'node:readline';

import type { DependencyField } from "./lib/types.ts";

import packageJson from "../package.json" with { type: "json" };
import { assertPnpmProject } from "./lib/package-manager-check.ts";
import {
  describePnpmAddCommand,
  getPackageInfo,
  getPnpmVerion,
  getWorkspaceProjects,
  runPnpmAdd,
} from "./lib/pnpm.ts";
import { packageExistsOnRegistry } from "./lib/registry.ts";
import {
  ensureRequiredWorkspaceSettings,
  isMonorepo,
  listNamedCatalogs,
} from "./lib/workspace-config.ts";

const CREATE_NEW_CATALOG = "__create_new_catalog__";
const VERSION_REGEX = /^[>=<~^]*(\d+)\.(\d+)(?:\.(\d+))?$/;

function bail(message: string): never {
  p.cancel(message);
  process.exit(1);
}

async function checkPackageManager() {
  let currentPnpmVersion: string;

  try {
    currentPnpmVersion = await getPnpmVerion();
  } catch {
    return undefined;
  }

  if (!currentPnpmVersion) {
    bail("This tool only supports `pnpm` package manager.");
  }

  const supportedPnpmVersion = packageJson.engines.pnpm;
  const currentMajorVersion = VERSION_REGEX.exec(currentPnpmVersion)?.[1];
  const supportedMajorVersion = supportedPnpmVersion.match(VERSION_REGEX)?.[1];

  if (supportedMajorVersion) {
    if (Number(currentMajorVersion) < Number(supportedMajorVersion)) {
      bail(
        `This tool requires pnpm v${supportedMajorVersion}.0.0 or newer. You are currently using v${currentPnpmVersion}.`,
      );
    }
  } else {
    p.log.warn(
      [
        "Could not determine the supported `pnpm` version.",
        "Continue anyway, but don't guaranty the result.",
      ].join(os.EOL),
    );
  }
}

function filterOutFlags(packages: string[]) {
  const args = packages.filter(pkg => pkg.startsWith("-"));

  if (args.length > 0) {
    p.note(
      [
        "This tool is purely interactive and doesn't need any flags.",
        "Passing them won't do any harm, as they will be completely ignored.",
      ].join(os.EOL),
      "About flags",
    );
  }

  return packages.filter(pkg => !pkg.startsWith("-"));
}

async function getPackagesFromUserInput() {
  const result = await p.text({
    message:
      "Which packages you want to install? You can enter space- or comma-separated list of names",
    placeholder: "react react-router",
  });

  const packages = filterOutFlags(
    typeof result === "string" ? result.split(/\s+/) : [],
  );

  if (packages.length === 0) {
    const choice = await p.select({
      message: [
        "You haven't specified any packages to install.",
        "Would you like yo try again or exit?",
      ].join(os.EOL),
      options: [{ value: "Try again" }, { value: "Exit" }],
    });

    if (choice === "Exit") {
      bail("Good bye, See you,");
    }

    if (choice === "Try again") {
      return getPackagesFromUserInput();
    }
  }

  return packages;
}

async function main() {
  await checkPackageManager();

  const cwd = process.cwd();
  const packagesFromArgs = filterOutFlags(process.argv.slice(2));

  p.intro("Installing packages");

  const packagesFromUserInput =
    packagesFromArgs.length === 0 ? await getPackagesFromUserInput() : [];

  const packages = packagesFromArgs.concat(packagesFromUserInput);

  // Ensures pnpm-workspace.yaml exists with catalogMode: strict and
  // saveExact: true, creating/updating it (with confirmation) if needed.
  // Exits the process if the user declines either setting.
  // const { doc } = await ensureRequiredWorkspaceSettings(cwd);

  // --- Typo guard: validate every package name against the npm registry ---
  /*const validatedNames: string[] = [];
  for (const original of packages) {
    let current = original;
    for (;;) {
      const spinner = p.spinner();
      spinner.start(`Checking "${current}" on the npm registry`);
      const exists = await packageExistsOnRegistry(current);
      spinner.stop(exists ? `Found "${current}"` : `Not found: "${current}"`);

      if (exists) {
        validatedNames.push(current);
        break;
      }

      const corrected = await p.text({
        message: `"${current}" isn't on the npm registry. Enter the correct name (empty to cancel):`,
      });
      if (p.isCancel(corrected) || !corrected) {
        bail("Cancelled.");
      }
      current = corrected;
    }
  }*/

  const found: string[] = [];
  const missing: string[] = [];

  p.log.info(`Checking packages on the npm registry...`);
  await Promise.all(
    packages.map(async pkg => {
      try {
        const result = await getPackageInfo(pkg);
        const lines = result.split(os.EOL);
        const name = lines[0]?.split(/\s+/)[0];
        if (name) {
          found.push(name);
        } else missing.push(pkg);
      } catch {
        missing.push(pkg);
      }
    }),
  );

  if (found.length > 0) {
    p.log.success(["Found packages", found.map(pkg => `- ${pkg}`).join(os.EOL)].join(os.EOL));
  }

  if (missing.length > 0) {
    p.log.warn(["Missing packages: ", missing.map(pkg => `- ${pkg}`).join(os.EOL)].join(os.EOL));
    const result = await p.text({
      message:
        "Would you like to make corrections? Press `Escape` to cancel and continue with valid packages.",
      initialValue: missing.join(" ")
    });
    if (p.isCancel(result)) bail("Cancelled.");
  }

  // --- Step 0: which project? Skipped entirely outside a monorepo. ---
  /*let isRoot = true;
  let targetName: string | undefined;

  if (isMonorepo(doc)) {
    const spinner = p.spinner();
    spinner.start("Discovering workspace projects");
    const projects = await getWorkspaceProjects(cwd);
    spinner.stop(`Found ${projects.length} project(s)`);

    const rootProject = projects.find(proj => proj.path === cwd);
    const otherProjects = projects.filter(proj => proj.path !== cwd);

    const selected = await p.select({
      message: "Which project should this be installed into?",
      options: [
        ...(rootProject
          ? [{ value: rootProject.name, label: `${rootProject.name} (root)` }]
          : []),
        ...otherProjects.map(proj => ({ value: proj.name, label: proj.name })),
      ],
    });

    if (p.isCancel(selected)) bail("Cancelled.");

    targetName = selected as string;
    isRoot = rootProject != null && targetName === rootProject.name;
  }*/

  // --- Step 1: dependency type ---
  /*  const dependencyField = await p.select<DependencyField>({
    message: "Save as:",
    options: [
      { value: "dependencies", label: "dependencies" },
      { value: "devDependencies", label: "devDependencies" },
    ],
  });
  if (p.isCancel(dependencyField)) bail("Cancelled.");*/

  // --- Step 2: catalog ---
  /*const existingCatalogs = listNamedCatalogs(doc);
  const catalogChoice = await p.select({
    message: "Which catalog should the version live in?",
    options: [
      ...existingCatalogs.map(name => ({ value: name, label: name })),
      { value: CREATE_NEW_CATALOG, label: "+ Create a new catalog" },
    ],
  });
  if (p.isCancel(catalogChoice)) bail("Cancelled.");

  let catalogName: string;
  if (catalogChoice === CREATE_NEW_CATALOG) {
    const newName = await p.text({
      message: "New catalog name:",
      validate: value => {
        if (!value) return "Required.";
        if (/\s/.test(value)) return "No whitespace allowed.";
        if (existingCatalogs.includes(value))
          return "That catalog already exists.";
        return undefined;
      },
    });
    if (p.isCancel(newName)) bail("Cancelled.");
    catalogName = newName;
  } else {
    catalogName = catalogChoice;
  }

  const addOptions = {
    packageNames: validatedNames,
    cwd,
    targetName,
    isRoot,
    dependencyField: dependencyField as DependencyField,
    catalogName,
  };

  p.note(describePnpmAddCommand(addOptions), "Running");*/

  // Inherited stdio: if pnpm pauses to ask "approve builds?" it shows up
  // directly in the terminal, same as running the command by hand.
  /*const exitCode = await runPnpmAdd(addOptions);

  p.outro(exitCode === 0 ? "Done." : `pnpm exited with code ${exitCode}.`);
  process.exit(exitCode);*/
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
