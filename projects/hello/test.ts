import { findWorkspaceDir } from "@pnpm/find-workspace-dir"
import * as process from "node:process"

console.log(await findWorkspaceDir(process.cwd()))
