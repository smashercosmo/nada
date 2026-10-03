## Problem Statement

The CLI tool installs dependencies with pnpm, but it has no awareness of pnpm workspaces, catalogs, dependency types or build-script approval. A developer working in a pnpm workspace has to remember which workspace each dependency belongs in, whether it is a dev or production dependency, which catalog (if any) it should live in, and which `pnpm add` flags express all of that. pnpm's own noisy output hides what is actually being installed, and a dependency whose build scripts are not yet approved makes the install fail with an error that sends the user off to run another command. Developers who have not configured pnpm's `catalogMode` get no guidance about it, and developers who want catalogs enforced have no easy way to turn that on.

## Solution

The CLI asks, for every package being installed, three simple questions: which workspace it goes into, whether it is a dev dependency, and which catalog it belongs to (or none). Previous answers are pre-selected, so repeating a choice is a single keypress. When the workspace has not configured `catalogMode`, the CLI first explains what the setting does and offers to set it. Packages are then grouped by identical (catalog, workspace, dependency type) answers and installed one batch at a time behind a spinner that names what is being installed, with pnpm's own output hidden. If pnpm reports that some dependencies need their build scripts approved, the CLI continues with the remaining batches and then offers to run pnpm's own approval flow. The run ends with a summary of what was installed where, what settings changed, what failed and what still needs attention.

## User Stories

1. As a developer, I want to choose the workspace for each package I'm installing, so that every dependency lands in the project that actually uses it.
2. As a developer, I want the root of the workspace offered alongside the member packages, so that I can add root-level tooling.
3. As a developer in a workspace whose root also appears in pnpm's project list, I want the root shown only once, so that the list isn't confusing.
4. As a developer, I want each workspace choice labelled with the project's name (or folder name if it has none) and its path relative to the workspace root, so that I can tell similar projects apart.
5. As a developer, I want to say whether each package is a dev dependency, so that it ends up in the right dependency field.
6. As a developer, I want the workspace, dev/prod and catalog questions asked in that order for every package, so that the flow is predictable.
7. As a developer installing several packages, I want my previous answers pre-selected for the next package, so that repeating a choice is just Enter.
8. As a developer, I want to choose a catalog for each package from the existing catalogs, the `default` catalog (even if it doesn't exist yet), or a brand-new catalog, so that every package has an explicit home.
9. As a developer, I want to create a new catalog in the middle of the per-package flow, so that I don't have to plan names in advance.
10. As a developer, I want a catalog name I create earlier in the same run offered for later packages, so that I can reuse it.
11. As a developer, I want catalog names validated (lowercase letters, digits, `.`, `_`, `-`, starting with a letter or digit), so that I can't create a name that breaks the workspace file.
12. As a developer, I want the name `default` rejected when creating a new catalog, so that it can't be confused with the built-in default catalog.
13. As a developer, I want a name I type that matches an existing catalog to simply reuse it with a short note, so that a harmless mistake doesn't block me.
14. As a developer, I want catalogs that already contain a package to show a hint with its current version range, so that I can avoid accidental duplication.
15. As a developer, I want a "No catalog" option for a package when my workspace allows it, so that I can install a dependency directly.
16. As a developer whose workspace enforces catalogs through `catalogMode`, I want "No catalog" not to be offered, so that I can't pick something the workspace is configured to prevent.
17. As a developer whose `catalogMode` is unset, I want an explanation that "No catalog" can be removed by setting `catalogMode` to `strict` (recommended) or `prefer`, so that I understand how to change that.
18. As a developer, I want that explanation to say briefly what `strict` does (only versions that satisfy the catalog are accepted), so that I can make an informed choice.
19. As a developer whose `catalogMode` is unset, I want to be asked whether to set it now, with `strict`, `prefer`, `manual` and "Skip for now" as choices, so that I can configure it without leaving the tool.
20. As a developer who picks a mode, I want it saved in the workspace's own settings (not my global pnpm config), so that it applies to the team and nothing else on my machine changes.
21. As a developer who picks a mode, I want the CLI to verify it was saved, and tell me clearly if it wasn't, so that I'm not misled.
22. As a developer who picks a mode, I want the explanation and the prompt never shown again, so that I'm not nagged once it's set.
23. As a developer who picks a mode during this run, I want the catalog options of this same run to reflect it immediately (for example "No catalog" disappears), so that the flow is consistent.
24. As a developer who explicitly set `catalogMode` to `manual`, I want to be treated as having decided, so that I'm never asked about it.
25. As a developer who skips the prompt, I want it to come back next time, so that I can decide later.
26. As a developer, I want packages with identical workspace, type and catalog answers installed together, so that installs are fast and few commands run.
27. As a developer, I want a package installed into the root workspace to be installed at the root, so that it doesn't need a separate flag from me.
28. As a developer, I want a package installed into a member workspace to be installed there, so that only that project's manifest changes.
29. As a developer, I want packages in the `default` catalog to use pnpm's default-catalog behavior and packages in other catalogs to use the named-catalog behavior, so that they land in the right place.
30. As a developer, I want pnpm to create any new catalog entry for me, so that the tool never rewrites my workspace file or its comments.
31. As a developer, I want pnpm's own output hidden during installs, so that the screen stays clean.
32. As a developer, I want a spinner that names the dependencies being installed and where they are going, so that I know what's happening.
33. As a developer debugging an install, I want a way to see pnpm's raw output, so that I can diagnose problems.
34. As a developer, I want pnpm unable to hang waiting for hidden input, so that the tool never appears frozen.
35. As a developer, I want a failed install to show the relevant part of pnpm's error, so that I can understand it without re-running manually.
36. As a developer whose install fails for a real reason (not build approval), I want the remaining batches skipped and the tool to exit with a failure code, so that scripts and CI notice.
37. As a developer who asks for a version outside what a strict catalog allows, I want pnpm's mismatch error shown clearly, so that I know why it was rejected.
38. As a developer, I want packages with ignored build scripts to be treated as a non-fatal outcome, so that the other batches still install.
39. As a developer, I want to be asked once, after all batches have run, whether to approve dependency builds, so that I'm not interrupted per batch.
40. As a developer, I want the CLI to explain in its own words why approval is needed and list the affected dependencies, so that I understand what I'm approving.
41. As a developer who says yes, I want to use pnpm's own interactive picker with full terminal control, so that I can choose exactly which packages to approve.
42. As a developer who approves builds, I want the approved scripts to actually run, so that I don't need a second install.
43. As a developer who says no, I want the summary to tell me the manual command, so that I can do it later.
44. As a developer, I want a summary at the end showing each package, the workspace it went to, its type and its catalog, so that I can check the result at a glance.
45. As a developer, I want the summary to show how many packages and batches were installed and how long it took, so that I know the scale of what happened.
46. As a developer, I want the summary to show settings that were changed, so that nothing changes without my noticing.
47. As a developer, I want the summary to show approved and still-pending builds, so that I know what is incomplete.
48. As a developer, I want the summary to list which files were likely updated, so that I know what to review in version control.
49. As a developer, I want packages that were already in a catalog to be noted in the summary, so that I know they weren't newly added there.
50. As a developer after a partial failure, I want the summary to show what succeeded and what failed, so that I can continue from there.
51. As a developer in a project that isn't a workspace, I want only the dev/prod question for each package, so that I'm not asked about workspaces or catalogs that don't apply.
52. As a developer in a project that isn't a workspace, I want no `catalogMode` explanation or prompt, so that irrelevant settings aren't pushed at me.
53. As a developer who presses Ctrl+C at any prompt, I want the CLI to cancel cleanly with a failure exit code and install nothing, so that I never get a partial install.
54. As a developer, I want unexpected errors anywhere in the CLI to print a message and exit with the fatal exit code, so that failures are never silent.
55. As a maintainer writing tests, I want the working directory overridable through the existing environment variable, so that I can run the CLI against fixture workspaces.
56. As a maintainer writing tests, I want guide lines disableable through the existing environment variable, so that output comparisons stay simple.

## Implementation Decisions

- **Supersedes the earlier design.** The tool-config `catalogs` flag, the three scenario-based menus, the "all packages in one catalog" modes and the "create several catalogs up front" flow are removed. The tool's own config is no longer used by the catalog flow. Native `catalogMode` replaces the flag.
- **Pnpm version.** The tool targets pnpm 12.0.0 or newer. Version enforcement is not part of this work.
- **Flow order.** Collect and validate packages (unchanged); read workspace context; handle `catalogMode` (explain, prompt, set); ask per-package questions; build the plan; install batches; handle ignored builds; print the summary.
- **Workspace context.**
  - The workspace root is the directory containing the workspace settings file, searched from the working directory upward. If none is found, the project is not a workspace.
  - Targets are the root plus every project reported by pnpm's recursive project listing (JSON, depth -1), de-duplicated by path, so it works whether or not pnpm includes the root in that list.
  - In a non-workspace project the only target is the project itself and workspace and catalog questions are skipped.
  - The workspace prompt is skipped only when exactly one target exists (non-workspace project, or a workspace with no members). If members exist the prompt is always shown, even for a single package.
- **`catalogMode` handling.**
  - The mode is read with pnpm's config command in JSON mode; `null` means unset.
  - Only an unset mode triggers the info message and the "set it now?" prompt. An explicit `manual` counts as decided.
  - The info message says that "No catalog" can be removed by setting `catalogMode` to `strict` (recommended) or `prefer`, and adds one line that `strict` only accepts versions that satisfy the catalog.
  - The prompt offers `strict`, `prefer`, `manual` and "Skip for now". Choosing a mode runs pnpm's config set command with the project location and then re-reads the value to confirm it was saved; a mismatch is reported as an error.
  - Skipping saves nothing, so the message and prompt appear again next run.
  - "No catalog" is available per package only when the effective mode is unset or `manual`, evaluated after the prompt so a mode just set takes effect immediately.
- **Per-package questions.** For each package, in this order: workspace target, "Is this a dev dependency?" (yes/no; peer and optional types are not offered), then catalog. Each prompt pre-selects the previous package's answer. The catalog list contains every existing catalog, `default` (always, even when it doesn't exist yet), "＋ Create new catalog" and, when allowed, "No catalog". Existing-catalog entries show a hint when they already contain the package.
- **Catalog names.** Must match lowercase letters, digits, `.`, `_`, `-` and start with a letter or digit. `default` is reserved. A name equal to an existing catalog, or to one created earlier in the same run, is reused with an info note. Catalogs created earlier in the run appear in later packages' lists.
- **Catalog creation.** The tool never edits the workspace file for catalogs. pnpm creates the entry when asked to save into a new name.
- **Reading catalog data.** Existing catalog names come from the existing helper, which treats both the singular and plural definitions as the same `default` catalog. Catalog contents come from pnpm's config reads and tolerate empty or failing reads.
- **Plan and grouping.** The plan groups package specs by (catalog or none, workspace target, dev or prod). Batches run sequentially in order of first appearance.
- **Add command contract.** The add command takes a working directory, package specs, an optional catalog name, a workspace target and a dev flag. No catalog name means no catalog flag; `default` means the default-catalog flag; any other name means the named-catalog flag. The root target uses pnpm's workspace-root flag. A member target uses a filter. The dev flag adds the dev-dependency flag. Specs are appended unchanged. Returns the exit code and captured output.
- **Workspace labels and filtering.** Each workspace choice is labelled `name (/relative/path)`, where the name is the project's name or, if it has none, its folder name, and the path is relative to the workspace root with a leading slash (for example `hello (/projects/hello)`). The root is labelled `name (root)`. Members are targeted by package name. Members that have no name, or whose name is shared with another project, are targeted by relative path instead. All pnpm commands run from the workspace root.
- **Hidden output.** pnpm's stdout and stderr are captured, not inherited. Standard input is closed so pnpm fails fast instead of waiting for a prompt. The existing debug environment variable streams pnpm's raw output instead. A spinner shows the batch being installed, for example the package list with its workspace, type and catalog.
- **Outcome classification per batch.**
  - Success: exit code zero.
  - Ignored builds: pnpm exits non-zero with `ERR_PNPM_IGNORED_BUILDS`, but the packages are installed and the manifest is updated. This is non-fatal: the batch is marked "installed, builds pending", the package names are parsed from pnpm's message and remaining batches continue.
  - Any other failure: stop immediately, keep captured output for the summary and exit with pnpm's exit code after printing the summary.
- **Approving builds.** Once all batches have run, if any ignored builds were collected and no batch failed, the CLI explains why approval is needed and lists the affected packages, then asks whether to run pnpm's approval command. On yes, the spinner is stopped and the command runs from the workspace root with inherited input and output so pnpm's own interactive picker is used. No separate rebuild step is run afterwards, because pnpm 12 runs approved builds as part of approval. On no, the summary shows the manual command. After a real failure the question is skipped and the summary lists the pending builds with the manual command instead. Approvals are recorded by pnpm in the workspace settings file; afterwards the CLI reads that setting back to report which of the affected packages were approved, denied or are still undecided.
- **Summary.** A "Summary" note followed by an outro, containing: package and batch counts with elapsed time; for each workspace, its packages with type and catalog; settings changed (such as `catalogMode`); builds approved and still pending with the manual command; likely-updated files inferred from the plan (workspace manifests, workspace settings file when catalogs or settings were touched, lockfile); packages that were already in a catalog; and, on failure, a "Failed" block with the batch, exit code and the last lines of pnpm's error. The exit code is non-zero if any batch failed for a reason other than ignored builds.
- **Existing catalog entries.** The per-package catalog select shows a hint when a catalog already contains the package, and the summary notes packages that were already in the catalog they were placed in. There are no pre-install warnings about versions: if a requested version conflicts with a catalog entry, pnpm's own behavior applies (in `strict` mode its mismatch error is shown in the summary; in `manual` mode pnpm installs the version as a direct dependency without complaint).
- **Cancellation.** Cancelling any prompt prints a cancel message and exits with a dedicated non-zero code before any installation. A `catalogMode` already saved earlier in the same run stays saved.
- **Entry point.** Errors from the main function are handled on its promise, printing a message and exiting with the fatal exception exit code.
- **Constants.** Shared constants for the default catalog name and the cancellation exit code.

## Testing Decisions

- **What makes a good test.** Assert external behavior only: which prompts a user sees for a given workspace state, which pnpm commands are invoked (arguments and order), the printed output, the exit code and the resulting workspace settings. Do not assert on internal helpers or the order of internal calls.
- **Seam (single).** Run the CLI as a subprocess against a fixture workspace chosen through the working-directory environment variable, with scripted prompt input. The pnpm binary is the only variable: a fake pnpm placed first on the search path gives deterministic, recorded behavior for most tests (config reads, project listing, add, approve-builds), and a small smoke suite runs the same scenarios against a real pnpm 12 when an environment flag is set.
- **Scenarios to cover.**
  - Prompt flow: single and multiple packages, pre-selection of previous answers, workspace prompt skipped for a root-only workspace and shown for a workspace with members, dev/prod answers, catalog list contents (existing, `default`, create-new, no-catalog), name validation, existing-name reuse.
  - `catalogMode`: unset (message and prompt, each of the four answers, saved and verified, not shown again), explicit `manual`, `prefer`, `strict` ("No catalog" hidden), failure to save.
  - Non-workspace project: only dev/prod asked, no `catalogMode` message.
  - Grouping and commands: batches by (catalog, workspace, type); root target; member targeted by name, by path when unnamed or duplicated; default versus named catalog flags.
  - Hidden output: spinner messages, debug flag, input closed, failure output captured.
  - Failures: real failure stops the run with pnpm's exit code and a partial summary; strict mismatch error shown; ignored builds continue to later batches.
  - Ignored builds: approve (pnpm's picker takes over the terminal), decline (manual command in the summary), builds actually run after approval.
  - Version conflicts with a catalog entry: `strict` shows pnpm's mismatch error in the summary; `manual` installs a direct dependency and says nothing extra.
  - Workspace labels: named member, unnamed member (folder name), duplicate names (path filter), root labelled `(root)`.
  - Cancellation at each prompt installs nothing.
  - Summary contents for success, partial failure and pending builds.
- **Prior art.** The existing environment variables for the working directory and for disabling guide lines suggest string-comparison end-to-end tests already exist. This hasn't been verified against the test suite.

## Out of Scope

- Peer, optional or other dependency types.
- Installing, checking or enforcing the pnpm version.
- Bulk "apply to all packages" choices for workspace, type or catalog.
- A tool-config setting for catalogs or for remembering that the user skipped the `catalogMode` prompt.
- Using catalogs in a project that isn't a workspace (pnpm itself would create the workspace file there, but the tool does not offer it).
- Editing the workspace settings file directly, or moving existing dependencies into catalogs.
- Handling pnpm prompts other than build approval (for example confirming a modules purge); pnpm is run non-interactively and any such prompt fails fast.
- Parsing build approvals beyond what pnpm's message provides.
- Pre-install warnings about a requested version not satisfying a catalog entry (no semver dependency; pnpm's own error is shown instead).

## Further Notes

Behaviors checked against pnpm 12.8.1 in a throwaway workspace, which this spec relies on:

- **Config.** Reading `catalogMode` when unset returns `null`. Setting it with the project location writes it into the workspace settings file and it reads back. The file's permissions changed to owner-only after the write, which is worth noting for shared checkouts.
- **Project listing.** In a workspace, the recursive listing included the root project in this version, which differs from the observation that it doesn't. De-duplicating by path handles both. A non-workspace project lists only itself. Members without a name appear without a name field, and two members can share a name.
- **Catalog flags.** The default-catalog flag writes the singular catalog definition and the named flag creates the plural entry. The root needs the workspace-root flag. Filtering by a name shared by two members installed into both. Filtering by relative path worked for an unnamed member.
- **Version mismatch.** With `catalogMode` at `manual`, asking for a version that differs from the catalog entry exited zero, wrote the version directly into the manifest and left the catalog unchanged, with no visible warning. With `strict`, pnpm failed with a catalog version mismatch error and exit code 1. The earlier assumption that pnpm overrides the catalog version was wrong.
- **Ignored builds.** Adding a dependency with an unapproved build script exited with code 1 and `ERR_PNPM_IGNORED_BUILDS`, but the package was installed and the manifest was updated. Approving with the "all" option wrote the approval to the workspace settings and ran the build immediately, so no separate rebuild was needed. Approval also accepts explicit package names.
- **Non-workspace projects.** The named-catalog flag works there too (pnpm creates the workspace file), but this is deliberately not used.

- **Approvals can be read back.** The `allowBuilds` setting reads as a map of package name to true (approved) or false (denied); undecided packages are absent.
- **Plain projects can become workspaces.** In a non-workspace project, running pnpm's approval command creates a workspace settings file. From the next run on, that project is treated as a (root-only) workspace: the `catalogMode` explanation and the catalog questions appear, while the workspace prompt stays skipped because there is only one target.
  - **Spinner in non-interactive terminals.** In a non-TTY the spinner prints each update on its own line, which is cosmetic only.
