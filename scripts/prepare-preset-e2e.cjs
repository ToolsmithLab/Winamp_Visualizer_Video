"use strict";

const path = require("node:path");
const {
  PresetLibraryService
} = require("../dist/main/presets/presetLibraryService");
const {
  PresetImportService
} = require("../dist/main/presets/presetImportService");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");

const root = path.resolve(__dirname, "..");
const profile = path.resolve(process.argv[2]);
const fixture = path.resolve(
  process.argv[3] || "tests/fixtures/preset-import/valid.milk"
);

async function validate(presetPath) {
  const service = new ProjectMHostService({
    hostPath: path.join(root, "native", "bin", "win-x64", "projectm-host.exe"),
    libraryPath: path.join(root, "native", "bin", "win-x64", "projectM-4.dll"),
    presetPath
  });
  try {
    const status = await service.initialize(270, 480);
    if (!status.available) {
      return { valid: false, error: status.error, version: status.version, frameHash: "" };
    }
    const frame = await service.render({
      width: 270,
      height: 480,
      steps: 2,
      channels: 2,
      samples: new Float32Array(960)
    });
    return {
      valid: Boolean(frame),
      error: frame ? "" : "Framebuffer assente",
      version: status.version,
      frameHash: frame ? String(frame.frameIndex) : ""
    };
  } finally {
    await service.shutdown();
  }
}

async function main() {
  const library = new PresetLibraryService(path.join(profile, "preset-library"));
  await library.initialize();
  const importer = new PresetImportService(library, validate);
  const report = await importer.importFiles([fixture], "copy");
  if (!report.imported.length && !report.duplicates.length) {
    throw new Error(JSON.stringify(report.issues));
  }
  process.stdout.write(
    `${JSON.stringify(report.imported[0] || report.duplicates[0], null, 2)}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
