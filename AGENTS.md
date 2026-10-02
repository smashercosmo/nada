## Vendored Repositories

This project vendors external repositories under @repos/

- Use vendored repositories as read-only reference material when working with related libraries
- Prefer examples and patterns from the vendored source code over generated guesses or web search results
- Do not edit files under @repos/ unless explicitly asked
- Do not import from @repos/ - application code should continue importing from normal package dependencies

## `node_modules`, `package.json` and `pnpm-workspace.yaml`

- Any time you need to get some data from the installed packages, kept in the `node_modules` folder use native `pnpm` commands for that (check @repos/ folder to find out the suitable one).
- The same applies to `package.json` and `pnpm-workspace.yaml` files. If you need to get certain fields value from any of these files use dedicated `pnpm` commands. 
- All the information regardinng pnps's source code and pnpm's docs you can get from "./repos/pnpm" and "repos/nodejs.io" respectively.

# Working with `Node.js`

- We're using the latest Node.js in this project, so you're free to leverage all the latest features and best practices to make code more readable and less verbose (like, for example, Node 12.6.0 now supports native command line args oarsing via utils.parseArgs method)
- All the information regardinng node's source and node's docs you can get from "./repos/node" and "repos/nodejs.org" respectively.
- When using node's functions, don't destructure them, but import the whole module from node and use the dot-notation.
