const { build, Platform, Arch } = require("electron-builder");
const path = require("node:path");

void (async () => {
  // Electron must act as Node only for this wrapper. Packaged child processes
  // must start in their normal Electron mode.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const prepackagedArgument = process.argv.find((argument) =>
    argument.startsWith("--prepackaged-path=")
  );
  const outputArgument = process.argv.find((argument) =>
    argument.startsWith("--output=")
  );
  const usePrepackaged =
    process.argv.includes("--prepackaged-final") || Boolean(prepackagedArgument);
  const prepackagedPath = prepackagedArgument
    ? path.resolve(prepackagedArgument.slice("--prepackaged-path=".length))
    : path.resolve("release", "win-unpacked");
  const outputPath = outputArgument
    ? path.resolve(outputArgument.slice("--output=".length))
    : undefined;
  const artifacts = await build({
    targets: Platform.WINDOWS.createTarget(["nsis", "portable"], Arch.x64),
    ...(outputPath
      ? { config: { directories: { output: outputPath } } }
      : {}),
    ...(usePrepackaged
      ? { prepackaged: prepackagedPath }
      : {})
  });
  process.stdout.write(`${JSON.stringify(artifacts, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
