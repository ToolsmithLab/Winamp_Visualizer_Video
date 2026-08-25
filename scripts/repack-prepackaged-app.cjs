"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const asar = require("@electron/asar");

const root = path.resolve(__dirname, "..");
const prepackaged = path.resolve(process.argv[2] || "");
if (!process.argv[2]) {
  throw new Error("Uso: repack-prepackaged-app.cjs <cartella prepackaged>");
}

async function main() {
  const resources = path.join(prepackaged, "resources");
  const archive = path.join(resources, "app.asar");
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), "AVS_Repack_"));
  const nextArchive = `${stage}.asar`;
  try {
    asar.extractAll(archive, stage);
    await fs.rm(path.join(stage, "dist"), { recursive: true, force: true });
    await fs.cp(path.join(root, "dist"), path.join(stage, "dist"), {
      recursive: true
    });
    await fs.copyFile(
      path.join(root, "package.json"),
      path.join(stage, "package.json")
    );
    await asar.createPackageWithOptions(stage, nextArchive, {
      unpackDir:
        "{node_modules/@napi-rs/canvas,node_modules/@napi-rs/canvas-win32-x64-msvc}"
    });
    await fs.copyFile(nextArchive, archive);

    await fs.cp(
      path.join(root, "native", "bin", "win-x64"),
      path.join(resources, "native", "win-x64"),
      { recursive: true, force: true }
    );
    await fs.cp(
      path.join(root, "native", "ffmpeg", "win-x64"),
      path.join(resources, "native", "ffmpeg", "win-x64"),
      { recursive: true, force: true }
    );
    await fs.cp(
      path.join(root, "licenses"),
      path.join(resources, "licenses"),
      { recursive: true, force: true }
    );
    await fs.copyFile(
      path.join(root, "THIRD_PARTY_LICENSES.md"),
      path.join(resources, "THIRD_PARTY_LICENSES.md")
    );
    await fs.copyFile(
      path.join(root, "PRESET_LICENSES.md"),
      path.join(resources, "PRESET_LICENSES.md")
    );
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
    await fs.rm(nextArchive, { force: true });
    await fs.rm(`${nextArchive}.unpacked`, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
