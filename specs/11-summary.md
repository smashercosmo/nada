# Summary and exit (Step 11)

## Overview

The last step shows what happened and ends the program. It reports what was installed and where, which settings changed, how builds ended up, which files probably changed, and, after a failure, what went wrong. It then sets the exit code.

Input: the batch results (Step 9), the choices (Step 8), the build report (Step 10), which settings Steps 6 and 7 saved (`catalogMode`, `saveExact`), the workspace root, and the elapsed time.
Output: the exit code.

## Goals

- Let the user check the result at a glance.
- Make nothing that changed on their machine a surprise.
- Be just as useful after a partial failure as after a success.

## User stories

1. As a user, I want to see how many packages and batches were installed and how long it took.
2. As a user, I want each package listed under its workspace with its dependency type and catalog, so that I can check where everything went.
3. As a user, I want settings that changed shown, so that nothing changes without my noticing.
4. As a user, I want approved, denied and pending builds shown, with the manual command if any are pending.
5. As a user, I want the files that were probably updated listed, so that I know what to review in version control.
6. As a user, I want packages that were already in their catalog noted.
7. As a user after a failure, I want what succeeded, what failed (with pnpm's error lines) and what was not run.
8. As a user running this in a script, I want a non-zero exit code if something really failed.

## Behavior

The summary is one "Summary" note followed by a closing line.

| Section | Contents | Shown when |
| --- | --- | --- |
| Headline | `Installed N packages in M batches (12.4s)` | always |
| Workspaces | Each workspace label, then its packages with dependency type and catalog, in aligned columns | something was installed |
| Settings | `catalogMode set to "strict"`, `saveExact set to true` (one line per setting) | Step 6 or Step 7 saved a setting |
| Builds | Approved, denied and pending names; "Run `pnpm approve-builds` to review them" if any pending | builds were reported |
| Updated | Likely changed files, inferred from the plan | something was installed |
| Existing | Packages that were already in the catalog they were placed in, with the range | there are any |
| Failed | The batch, pnpm's exit code and the last lines of its error | a batch failed |
| Not run | Batches skipped after a failure | there are any |

- **Updated files** are the manifests of the workspaces that received packages, the workspace settings file when catalogs, a saved setting or approvals were involved, and the lockfile. They are inferred, not read from disk.
- **Closing line.** "Done!" on success, "Finished with errors." after a real failure.
- **Exit code.** Zero unless a batch failed for a reason other than ignored builds. Then it is that batch's pnpm exit code.

## Scenarios

| Situation | Outcome |
| --- | --- |
| Everything installed | Headline, workspaces, updated files; "Done!"; exit 0 |
| Installed with pending builds | Same, plus a Builds section; exit 0 |
| Builds approved | Builds shows the approved packages; the workspace file is listed as updated |
| One batch fails, others skipped | Succeeded batches listed, Failed and Not run blocks; "Finished with errors."; pnpm's exit code |
| Package already in its catalog | Appears under Existing |
| Plain project | Single workspace group, no catalog or settings lines |

## Implementation decisions

- Formatting is a pure function from the collected results to text, so it can be tested without running anything.
- Columns are aligned on the longest package string.
- The summary is printed even after a failure, and the exit happens only afterwards.
- The failure block shows only the last lines of pnpm's output, to keep the summary short.

## Testing decisions

- Assert on the produced text for success, partial failure, pending builds, approved builds and already-in-catalog cases, and on the exit code.

## Open questions

1. After any failure, add a line asking the user to review the workspace settings file, because a failed add can leave partial changes there (Step 9, open question 1).
2. The summary shows what the user asked for (for example `react`), not the version pnpm recorded. Reading the recorded versions back from the manifests would be a possible addition.

## Out of scope

- Writing the summary to a file.
- Machine-readable (JSON) output.
- Suggesting next commands beyond the manual approval command.
