# About the tool

`nada` is a convenient CLI tool to manage your project dependencies. As of
by "manage" I mean "install" only, as I've just started working on it and the
functionality that  I prioritize is intentionally quite limited.
IN future It might gtow into somethimg bigger.

### Why is it called `nada`?

The name is a reference to the well-known Russian meme "Nnnnnа́da?" (the word means "need", and most people pronounce it as "Nа́do", with the stress on the first syllable). The English equivalent would be something like "Nnnnneeda?".
You can easily Google it, but briefly, this meme is about a guy with a funny accent who offers everybody chaplets, saying: "Chaplets nnnnnada?" (Eng. "Nnnnneéde chaplets?").

### But how is it related?

Well, frameworks, libraries, and other packages are crucial for our work. But instead of having someone offer them to us, we ask our preferred package managers to get them delivered straight to our virtual environments.
We kinda say "nnnnada react redux typescript", meaning we "need react redux typescript".
But I'm just lazy — extremely lazy — to write four extra "n" characters, hence the name :)

### Who is it most usefull for?

You can use `nada` in any project, but __monorepos__ is where it actually shines.

### Requirements for the tool

- First of all, pnpm is the only supported packager and supporting other players is not in the plans.
  Pnpm's workspaces is basically an industry standard for monorepos at the moment.
- Secondly, the minimal supported pnpm version is `>=11`. Bo logical explanation here, I just like living on the edge
- especially when it comes to dev tools. So, make sure you have something like this in your packahe.json.
  ```json
  "devEngines": {
    "packageManager": { "name": "pnpm", "version": "10.0.0", "onFail": "download" }
  }
  ```

- 
- Only the `name` is checked — version enforcement is left to pnpm's own
  `onFail` handling.
- **`catalogMode: strict` and `saveExact: true` in `pnpm-workspace.yaml`.**
  These are hard requirements: every dependency goes into a *named* catalog
  (never the bare default catalog) with an exact version. If the file or
  either setting is missing, the tool offers to add it; declining exits
  without installing anything.

## What each prompt does

1. **Project** — only asked when `pnpm-workspace.yaml` has a non-empty
   `packages:` list (i.e. it's actually a monorepo). Options come from
   `pnpm list -r --depth -1 --json`, with the root project listed first.
   In a non-monorepo project this step is skipped and the root is used.
2. **Save as** — `dependencies` or `devDependencies`, applied to the whole
   batch of packages in one run.
3. **Catalog** — pick an existing named catalog or create a new one
   (`--save-catalog-name` creates it automatically if it's new).

Multiple package names in one run (`pnpm deps:install lodash axios uuid`)
all go to the same project/dep-type/catalog. For a different combination,
run the tool again.

Package names are checked against the npm registry up front; a miss lets
you retype the name before anything runs. There are no CLI flags to skip
prompts — this tool's whole point is guided, not scriptable use. For
CI/scripting, just call `pnpm add` directly.

## Setup

```bash
cd deps-install
npm install
npm run build
```

Then wire it into your monorepo root `package.json`:

```json
"scripts": {
  "deps:install": "node ./deps-install/dist/index.js"
}
```

(Adjust the path to wherever you place this folder.) Run it from the repo
root, e.g. `pnpm deps:install <package> [<package>...]`.

## Development

```bash
npm run start -- lodash    # runs directly via tsx, no build step
```

## Files

- `src/index.ts` — prompt flow and orchestration
- `src/lib/package-manager-check.ts` — verifies `devEngines.packageManager.name === "pnpm"`
- `src/lib/workspace-config.ts` — finds/creates `pnpm-workspace.yaml`, enforces
  `catalogMode: strict` + `saveExact: true`, reads `packages:`/`catalogs:`
- `src/lib/pnpm.ts` — lists workspace projects and runs `pnpm add`
- `src/lib/registry.ts` — npm registry existence check for typo guarding
