import { intersects } from "semver"
import { isEmpty } from "ts-extras"

export interface EngineDependency {
  name: string
  version?: string
}

type DevEngines = Partial<
  Record<"packageManager", EngineDependency | readonly EngineDependency[]>
>

export interface PackageJson {
  packageManager?: string
  engines?: { pnpm?: string }
  devEngines?: DevEngines
}

function getPnpmVersionFromPackageJson(packageJson: PackageJson) {
  const packageManagerDevEngines = packageJson.devEngines?.packageManager

  const devEngineEntries = Array.isArray(packageManagerDevEngines)
    ? packageManagerDevEngines
    : packageManagerDevEngines
      ? [packageManagerDevEngines]
      : []

  const pnpmVersionsFromDevEnginesField = devEngineEntries
    .filter((item) => item.name === "pnpm")
    .map((item) => item.version)
    .filter((version): version is string => version !== undefined)

  if (!isEmpty(pnpmVersionsFromDevEnginesField)) {
    return pnpmVersionsFromDevEnginesField.join(" ")
  }

  const pnpmVersionFromPackageManagerField = packageJson.packageManager?.startsWith("pnpm@")
    ? packageJson.packageManager.slice("pnpm@".length)
    : undefined

  return pnpmVersionFromPackageManagerField ?? packageJson.engines?.pnpm
}

function isCliPnpmVersionSupported({
  targetPackageJson,
  cliPackageJson,
}: {
  targetPackageJson: PackageJson
  cliPackageJson: PackageJson
}) {
  const cliPnpmVersion = getPnpmVersionFromPackageJson(cliPackageJson)
  const targetPnpmVersion = getPnpmVersionFromPackageJson(targetPackageJson)

  if (cliPnpmVersion && targetPnpmVersion) {
    return intersects(cliPnpmVersion, targetPnpmVersion)
  }

  return undefined
}

export { isCliPnpmVersionSupported }
