"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeProject } = require("../dist/shared/project");
const {
  renderProjectMExport
} = require("../dist/main/projectm/projectMExportRenderer");

const root = path.resolve(__dirname, "..");
const projectPath = path.resolve(process.argv[2] || "");
const catalogPath = path.resolve(process.argv[3] || "");
const destination = path.resolve(process.argv[4] || "");
if (!projectPath || !catalogPath || !destination) {
  throw new Error(
    "Uso: run-unicode-export-diagnostic.cjs <project> <catalog> <output>"
  );
}

async function main() {
  const project = normalizeProject(
    JSON.parse(fs.readFileSync(projectPath, "utf8"))
  );
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  project.exportSettings.width = 180;
  project.exportSettings.height = 320;
  project.exportSettings.fps = 30;
  project.projectM.fps = 30;
  const ffmpeg = path.join(root, "native", "ffmpeg", "win-x64", "ffmpeg.exe");
  const args = [
    "-hide_banner",
    "-y",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    "180x320",
    "-framerate",
    "30",
    "-i",
    "pipe:0",
    "-i",
    project.audioFile,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libopenh264",
    "-profile:v",
    "high",
    "-allow_skip_frames",
    "0",
    "-rc_mode",
    "bitrate",
    "-b:v",
    project.exportSettings.videoBitrate,
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    project.exportSettings.audioBitrate,
    "-shortest",
    destination
  ];
  const runtime = await renderProjectMExport(
    null,
    ffmpeg,
    args,
    project,
    catalog.presets,
    { progress: () => {}, warning: () => {} }
  );
  const metrics = await runtime.completion;
  process.stdout.write(
    `${JSON.stringify(
      {
        destination,
        outputBytes: fs.statSync(destination).size,
        ...metrics
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
