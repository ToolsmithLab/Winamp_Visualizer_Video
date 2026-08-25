"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  PresetCatalogService
} = require("../dist/main/presets/presetCatalogService");
const {
  PresetLibraryService
} = require("../dist/main/presets/presetLibraryService");
const {
  PresetImportService
} = require("../dist/main/presets/presetImportService");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");
const {
  sha256File
} = require("../dist/main/presets/presetSecurity");

const root = path.resolve(__dirname, "..");
const archive = path.resolve(process.argv[2] || "");
const reportPath = path.resolve(
  process.argv[3] || "test-results/phase2/verified-preset-catalog.json"
);
if (!archive) throw new Error("Specificare il percorso dell'archivio projectM v4.1.6.");

const nativePaths = {
  hostPath: path.join(root, "native", "bin", "win-x64", "projectm-host.exe"),
  libraryPath: path.join(root, "native", "bin", "win-x64", "projectM-4.dll")
};

async function validatePreset(presetPath) {
  const host = new ProjectMHostService({ ...nativePaths, presetPath });
  try {
    const status = await host.initialize(270, 480);
    if (!status.available) {
      return { valid: false, error: status.error, version: status.version, frameHash: "" };
    }
    const frame = await host.render({
      width: 270,
      height: 480,
      steps: 2,
      channels: 2,
      samples: new Float32Array(960)
    });
    if (!frame) {
      return {
        valid: false,
        error: "Framebuffer di verifica assente.",
        version: status.version,
        frameHash: ""
      };
    }
    return {
      valid: true,
      error: "",
      version: status.version,
      frameHash: crypto.createHash("sha256").update(frame.bytes).digest("hex")
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
      version: "",
      frameHash: ""
    };
  } finally {
    await host.shutdown();
  }
}

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "AVSOfficialCatalog_"));
  const started = Date.now();
  try {
    const library = new PresetLibraryService(path.join(temporary, "library"));
    await library.initialize();
    const importer = new PresetImportService(library, validatePreset);
    const downloader = async (_url, destination) => {
      await fs.copyFile(archive, destination);
      return {
        bytes: (await fs.stat(destination)).size,
        sha256: await sha256File(destination)
      };
    };
    const catalog = new PresetCatalogService(
      path.join(root, "assets", "preset-catalog", "catalog-v1.json"),
      path.join(root, "licenses"),
      path.join(temporary, "catalog"),
      library,
      importer,
      downloader
    );
    const install = await catalog.install(
      "projectm-4.1.6-development-test-presets"
    );
    const integrity = await catalog.verify(
      "projectm-4.1.6-development-test-presets"
    );
    const records = library.list();
    const report = {
      generatedAt: new Date().toISOString(),
      archive,
      archiveBytes: (await fs.stat(archive)).size,
      archiveSha256: await sha256File(archive),
      elapsedMs: Date.now() - started,
      install,
      integrity,
      presetCount: records.length,
      validCount: records.filter((record) => record.status === "valid").length,
      quarantinedCount: records.filter((record) => record.quarantined).length,
      licenseVerifiedCount: records.filter((record) => record.licenseVerified).length,
      compatibility: [...new Set(records.map((record) => record.compatibility))],
      frameValidated: records.map((record) => ({
        id: record.id,
        name: record.name,
        hash: record.hash,
        status: record.status,
        compatibility: record.compatibility
      }))
    };
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
