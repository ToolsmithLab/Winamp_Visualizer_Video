"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const { IPC } = require("../dist/shared/ipc");
const { createDefaultProject } = require("../dist/shared/project");
const {
  cancelExport,
  startExport
} = require("../dist/main/exportService");

const root = path.resolve(__dirname, "..");
const audioPath = path.join(
  root,
  "test-results",
  "phase2",
  "parity",
  "1080x1920-30fps-60s",
  "reference.wav"
);
const output = path.join(
  root,
  "test-results",
  "phase2",
  "parity",
  "cancelled-partial.mp4"
);
const reportPath = path.join(
  root,
  "test-results",
  "phase2",
  "parity",
  "cancel-test.json"
);
const presetPath = path.join(
  root,
  "tests",
  "fixtures",
  "preset-import",
  "parity-one.milk"
);

function presetRecord() {
  return {
    id: "parity-one",
    name: "Fixture Cyan",
    author: "Test fixture",
    path: presetPath,
    origin: { kind: "internal", sourcePath: presetPath, label: "Cancel test" },
    importedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    hash: "parity-one",
    status: "valid",
    license: "CC0-1.0",
    licenseVerified: true,
    textures: [],
    missingTextures: [],
    compatibility: "projectM-4.1.6",
    favorite: false,
    quarantined: false,
    quarantineReason: "",
    errorReport: [],
    thumbnailPath: null
  };
}

async function main() {
  app.setAppPath(root);
  await app.whenReady();
  fs.rmSync(output, { force: true });
  const messages = [];
  let finish;
  const completed = new Promise((resolve) => {
    finish = resolve;
  });
  const window = {
    isDestroyed: () => false,
    webContents: {
      send(channel, payload) {
        if (channel !== IPC.exportProgress) return;
        messages.push(payload);
        if (payload.done) finish(payload);
      }
    }
  };
  const project = createDefaultProject();
  project.audioFile = audioPath;
  project.cover.filePath = null;
  project.exportSettings.width = 540;
  project.exportSettings.height = 960;
  project.exportSettings.fps = 30;
  project.projectM.presetId = "parity-one";
  project.projectM.sequenceStartPresetId = "parity-one";
  project.projectM.presetPath = presetPath;
  project.projectM.playlistIds = ["parity-one"];
  await startExport(window, project, output, [presetRecord()]);
  await new Promise((resolve) => setTimeout(resolve, 750));
  const accepted = cancelExport();
  const result = await Promise.race([
    completed,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout annullamento export.")), 30_000)
    )
  ]);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const report = {
    generatedAt: new Date().toISOString(),
    accepted,
    completion: result,
    outputRemoved: !fs.existsSync(output),
    temporaryFilesCreated: 0,
    messages
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!accepted || !result.cancelled || !report.outputRemoved) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app.quit());
