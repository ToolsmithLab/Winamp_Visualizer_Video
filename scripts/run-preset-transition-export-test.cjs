"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createDefaultProject } = require("../dist/shared/project");
const {
  renderProjectMExport
} = require("../dist/main/projectm/projectMExportRenderer");

const root = path.resolve(__dirname, "..");
const ffmpeg = path.join(root, "native", "ffmpeg", "win-x64", "ffmpeg.exe");
const destination = path.resolve(
  process.argv[2] || "test-results/phase2/preset-transition-export.mp4"
);
const reportPath = path.resolve(
  process.argv[3] || "test-results/phase2/preset-transition-export.json"
);
const audioPath = path.join(root, "test-results", "phase2", "multiband-10s.wav");
const bundledPath = path.join(
  root,
  "assets",
  "projectm",
  "presets",
  "AVS Audio Wave.milk"
);
const validPath = path.join(
  root,
  "tests",
  "fixtures",
  "preset-import",
  "valid.milk"
);

const presetRecord = (id, name, presetPath) => ({
  id,
  name,
  author: null,
  path: presetPath,
  origin: { kind: "internal", sourcePath: presetPath, label: "Test" },
  importedAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  hash: id,
  status: "valid",
  license: "Licenza non verificata",
  licenseVerified: false,
  textures: [],
  missingTextures: [],
  compatibility: "projectM-4.1.6",
  favorite: false,
  quarantined: false,
  quarantineReason: "",
  errorReport: [],
  thumbnailPath: null
});

async function main() {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const project = createDefaultProject();
  project.name = "Export transizioni";
  project.audioFile = audioPath;
  project.exportSettings.width = 180;
  project.exportSettings.height = 320;
  project.exportSettings.fps = 30;
  project.exportSettings.videoBitrate = "2M";
  project.projectM.presetId = "bundled-audio-wave";
  project.projectM.sequenceStartPresetId = "bundled-audio-wave";
  project.projectM.presetPath = bundledPath;
  project.projectM.playlistIds = ["bundled-audio-wave", "fixture-valid"];
  project.projectM.randomSeed = 424242;
  project.projectM.autoSwitch.enabled = true;
  project.projectM.autoSwitch.mode = "interval";
  project.projectM.autoSwitch.order = "sequential";
  project.projectM.autoSwitch.intervalSeconds = 2;
  project.projectM.autoSwitch.minimumSeconds = 2;
  project.projectM.autoSwitch.maximumSeconds = 2;
  project.projectM.transition.enabled = true;
  project.projectM.transition.durationSeconds = 0.75;
  for (const layer of project.layers) {
    if (layer.kind !== "projectM") layer.visible = false;
  }

  const args = [
    "-hide_banner",
    "-y",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    `${project.exportSettings.width}x${project.exportSettings.height}`,
    "-framerate",
    String(project.exportSettings.fps),
    "-i",
    "pipe:0",
    "-i",
    audioPath,
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
    String(project.exportSettings.fps),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    destination
  ];
  const cpuBefore = process.cpuUsage();
  const runtime = await renderProjectMExport(
    null,
    ffmpeg,
    args,
    project,
    [
      presetRecord("bundled-audio-wave", "Bundled", bundledPath),
      presetRecord("fixture-valid", "Fixture", validPath)
    ],
    {
      progress: () => {},
      warning: () => {}
    }
  );
  const metrics = await runtime.completion;
  const cpu = process.cpuUsage(cpuBefore);
  const probe = spawnSync(
    ffmpeg,
    ["-hide_banner", "-i", destination, "-f", "null", "NUL"],
    { encoding: "utf8" }
  );
  const stderr = probe.stderr || "";
  const file = fs.statSync(destination);
  const report = {
    generatedAt: new Date().toISOString(),
    output: destination,
    outputBytes: file.size,
    audioPresent: /Audio: aac/i.test(stderr),
    videoPresent: /Video: h264/i.test(stderr),
    transitionDurationSeconds: project.projectM.transition.durationSeconds,
    seed: project.projectM.randomSeed,
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    ...metrics
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.audioPresent || !report.videoPresent) process.exitCode = 2;
  if (metrics.presetChanges < 4) process.exitCode = 3;
  if (metrics.maximumConsecutiveBlackFrames >= 5) process.exitCode = 4;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
