import os from "node:os"

const SUPPORTED_PACKAGE_MANAGER = "pnpm" as const
const EXIT_CODE_FATAL_EXCEPTION = 1 as const
const EXIT_CODE_NO_MORE_CODE_TO_EXECUTE = 0 as const
const PACKAGE_MANAGER_IS_NOT_SUPPORTED_TEXT =
  "This tool only supports `pnpm` package manager." as const
const PNPM_VERSION_10 = 10 as const
const PNPM_VERSION_11 = 11 as const

const TEXT_INTRO = "Installing packages..." as const
const TEXT_CHECKING_IF_PNPM_IS_AVAILABLE = "Checking if `pnpm` is available..." as const
const TEXT_PNPM_CHECK_SUCCESS = "Found `pnpm` executable." as const
const TEXT_PNPM_CHECK_ERROR = [
  "This tool works with `pnpm` package manager only,",
  "but `pnpm` executable could not be found.",
].join(os.EOL)
const TEXT_CHECKING_IF_PNPM_VERSION_IS_SUPPORTED =
  "Checking if `pnpm` version is supported..." as const
const TEXT_COULD_NOT_DETERMINE_CURRENT_PNPM_VERSION = [
  "Could not determine the current `pnpm` version.",
  "Continue anyway, but don't guaranty the result.",
].join(os.EOL);
const TEXT_COULD_NOT_DETERMINE_SUPPORTED_PNPM_VERSION = [
  "Could not determine the supported `pnpm` version.",
  "Continue anyway, but don't guaranty the result.",
].join(os.EOL);
const TEXT_EXITING = "Exiting..." as const

function getPnpmVersionIsNotSupportedMessage({
  supportedPnpmMajorVersion,
  currentPnpmVersion,
}: {
  supportedPnpmMajorVersion: string
  currentPnpmVersion: string
}) {
  return [
    `This tool requires pnpm v${supportedPnpmMajorVersion}.0.0 or newer.`,
    `You are currently using v${currentPnpmVersion}.`,
  ].join(os.EOL)
}

export {
  SUPPORTED_PACKAGE_MANAGER,
  EXIT_CODE_FATAL_EXCEPTION,
  EXIT_CODE_NO_MORE_CODE_TO_EXECUTE,
  PACKAGE_MANAGER_IS_NOT_SUPPORTED_TEXT,
  PNPM_VERSION_10,
  PNPM_VERSION_11,
  TEXT_INTRO,
  TEXT_CHECKING_IF_PNPM_IS_AVAILABLE,
  TEXT_PNPM_CHECK_SUCCESS,
  TEXT_PNPM_CHECK_ERROR,
  TEXT_CHECKING_IF_PNPM_VERSION_IS_SUPPORTED,
  TEXT_EXITING,
  TEXT_COULD_NOT_DETERMINE_CURRENT_PNPM_VERSION,
  TEXT_COULD_NOT_DETERMINE_SUPPORTED_PNPM_VERSION,
  getPnpmVersionIsNotSupportedMessage,
}
