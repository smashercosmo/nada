import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as YAML from 'yaml'
import * as p from '@clack/prompts'

const CANDIDATE_FILENAMES = ["pnpm-workspace.yaml", "pnpm-workspace.yml"];

export interface WorkspaceConfig {
  filePath: string;
  doc: YAML.Document;
  /** Whether pnpm-workspace.yaml/.yml already existed on disk before this run */
  existed: boolean;
}

function findExistingWorkspaceFile(cwd: string): string | null {
  for (const filename of CANDIDATE_FILENAMES) {
    const candidate = path.join(cwd, filename);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function loadWorkspaceConfig(cwd: string): Promise<WorkspaceConfig> {
  const existingPath = findExistingWorkspaceFile(cwd);

  if (existingPath) {
    const raw = await readFile(existingPath, "utf8");
    const doc = YAML.parseDocument(raw) as YAML.Document;
    if (doc.contents == null) {
      doc.contents = doc.createNode({}) as YAML.Document["contents"];
    }
    return { filePath: existingPath, doc, existed: true };
  }

  const doc = new YAML.Document() as YAML.Document;
  doc.contents = doc.createNode({}) as YAML.Document["contents"];
  return {
    filePath: path.join(cwd, "pnpm-workspace.yaml"),
    doc,
    existed: false,
  };
}

/**
 * Loads (or prepares to create) pnpm-workspace.yaml and guarantees
 * `catalogMode: strict` and `saveExact: true` are set. Both are treated as
 * hard requirements: if the user declines adding them, the process exits
 * rather than falling back to a softer per-run question.
 */
export async function ensureRequiredWorkspaceSettings(
  cwd: string,
): Promise<WorkspaceConfig> {
  const config = await loadWorkspaceConfig(cwd);
  const { doc } = config;

  const missing: string[] = [];
  if (doc.get("catalogMode") !== "strict") missing.push("catalogMode: strict");
  if (doc.get("saveExact") !== true) missing.push("saveExact: true");

  if (missing.length === 0) {
    return config;
  }

  const fileDescription = config.existed
    ? path.basename(config.filePath)
    : `${path.basename(config.filePath)} (doesn't exist yet)`;

  const shouldAdd = await p.confirm({
    message: [
      `This tool requires the following in ${fileDescription}:`,
      ...missing.map((m) => `  - ${m}`),
      `Add ${missing.length > 1 ? "them" : "it"} now?`,
    ].join("\n"),
    initialValue: true,
  });

  if (p.isCancel(shouldAdd) || !shouldAdd) {
    p.cancel(
      "catalogMode: strict and saveExact: true are required to use this tool. Exiting.",
    );
    process.exit(1);
  }

  doc.set("catalogMode", "strict");
  doc.set("saveExact", true);
  await writeFile(config.filePath, doc.toString(), "utf8");

  return config;
}

/**
 * `Document#get()` only unwraps scalar leaf values — nested maps/sequences
 * come back as live YAMLMap/YAMLSeq nodes, not plain objects/arrays. For
 * read-only inspection we convert the whole document to plain JS once
 * instead of trying to unwrap individual nodes ourselves.
 */
function toPlainObject(doc: YAML.Document): Record<string, unknown> {
  const plain = doc.toJS();
  return plain && typeof plain === "object" ? plain : {};
}

/** True when pnpm-workspace.yaml declares a non-empty `packages:` glob list. */
export function isMonorepo(doc: YAML.Document): boolean {
  const packages = toPlainObject(doc)["packages"];
  return Array.isArray(packages) && packages.length > 0;
}

/** Names of existing named catalogs declared under `catalogs:`. */
export function listNamedCatalogs(doc: YAML.Document): string[] {
  const catalogs = toPlainObject(doc)["catalogs"];
  if (!catalogs || typeof catalogs !== "object") return [];
  return Object.keys(catalogs as Record<string, unknown>);
}
