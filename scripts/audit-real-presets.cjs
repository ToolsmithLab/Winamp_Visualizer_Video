"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createDefaultProject } = require("../dist/shared/project");
const {
  renderProjectMExport
} = require("../dist/main/projectm/projectMExportRenderer");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");

const root = path.resolve(__dirname, "..");
const assetsPath = path.resolve(process.argv[2] || "");
const outputDirectory = path.resolve(process.argv[3] || "");
if (!assetsPath || !outputDirectory) {
  throw new Error("Uso: audit-real-presets.cjs <audit-assets.json> <output>");
}
const ffmpeg = path.join(root, "native", "ffmpeg", "win-x64", "ffmpeg.exe");

function pcm(frameCount, frameIndex, audible) {
  const samples = new Float32Array(frameCount * 2);
  if (!audible) return samples;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const t = (frameIndex * frameCount + frame) / 48_000;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.1);
    const value =
      (Math.sin(t * Math.PI * 2 * 72) * 0.45 +
        Math.sin(t * Math.PI * 2 * 440) * 0.22 +
        Math.sin(t * Math.PI * 2 * 2200) * 0.12) *
      pulse;
    samples[frame * 2] = value;
    samples[frame * 2 + 1] = value;
  }
  return samples;
}

function frameHash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function nearlyBlack(bytes) {
  let visible = 0;
  for (let offset = 0; offset < bytes.length; offset += 16) {
    if (Math.max(bytes[offset], bytes[offset + 1], bytes[offset + 2]) > 8) visible += 1;
  }
  return visible < 4;
}

function presetRecord(record) {
  return {
    id: `audit-${record.index}`,
    name: record.name,
    author: null,
    path: record.originalPath,
    origin: { kind: "internal", sourcePath: record.originalPath, label: "Audit finale" },
    importedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    hash: record.sha256,
    status: "valid",
    license: record.declaredLicense,
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
  await fsp.mkdir(outputDirectory, { recursive: true });
  const assets = JSON.parse(await fsp.readFile(assetsPath, "utf8"));
  const records = assets.records.slice(0, 10);
  if (records.length < 10) throw new Error("Servono almeno 10 preset reali.");
  const nativePaths = {
    hostPath: path.join(root, "native", "bin", "win-x64", "projectm-host.exe"),
    libraryPath: path.join(root, "native", "bin", "win-x64", "projectM-4.dll")
  };
  const perPreset = [];
  let engineStatus = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const errors = [];
    let loaded = false;
    let pcmAccepted = false;
    let reactiveHash = "";
    let measuredFps = 0;
    let loadBlackFrames = 0;
    const service = new ProjectMHostService({
      ...nativePaths,
      presetPath: record.originalPath
    });
    try {
      const status = await service.initialize(270, 480);
      engineStatus ??= status;
      if (!status.available || status.version !== "4.1.6") {
        throw new Error(status.error || `Versione inattesa: ${status.version}`);
      }
      loaded = true;
      let blackFrames = 0;
      pcmAccepted = true;
      let finalFrame = null;
      const started = performance.now();
      for (let frameIndex = 0; frameIndex < 45; frameIndex += 1) {
        const samples = pcm(1600, frameIndex, true);
        const frame = await service.render({
          width: 270,
          height: 480,
          steps: 1,
          channels: 2,
          samples
        });
        if (!frame) throw new Error(`Framebuffer assente: ${record.name}`);
        if (frame.pcmSamples !== samples.length / 2) pcmAccepted = false;
        if (nearlyBlack(frame.bytes)) blackFrames += 1;
        finalFrame = frame;
      }
      const elapsedMs = performance.now() - started;
      measuredFps = 45 / (elapsedMs / 1000);
      reactiveHash = frameHash(finalFrame.bytes);
      loadBlackFrames = blackFrames;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      await service.shutdown().catch(() => undefined);
    }

    const transition = {
      attempted: index > 0,
      succeeded: index === 0,
      elapsedMs: 0,
      blackFrames: 0,
      error: ""
    };
    if (index > 0) {
      const transitionService = new ProjectMHostService({
        ...nativePaths,
        presetPath: records[index - 1].originalPath
      });
      const transitionStarted = performance.now();
      try {
        const status = await transitionService.initialize(270, 480);
        if (!status.available) throw new Error(status.error);
        await transitionService.loadPreset(record.originalPath, {
          smoothTransition: true,
          transitionSeconds: 0.35
        });
        for (let frameIndex = 0; frameIndex < 15; frameIndex += 1) {
          const frame = await transitionService.render({
            width: 270,
            height: 480,
            steps: 1,
            channels: 2,
            samples: pcm(1600, frameIndex, true)
          });
          if (!frame) throw new Error("Framebuffer transizione assente.");
          if (nearlyBlack(frame.bytes)) transition.blackFrames += 1;
        }
        transition.succeeded = true;
      } catch (error) {
        transition.error = error instanceof Error ? error.message : String(error);
        errors.push(`Transizione: ${transition.error}`);
      } finally {
        transition.elapsedMs = performance.now() - transitionStarted;
        await transitionService.shutdown().catch(() => undefined);
      }
    }
    perPreset.push({
      ...record,
      engineVersion: engineStatus?.version || "",
      loaded,
      audioPcmFramesAccepted: pcmAccepted,
      audioReactiveFrameHash: reactiveHash,
      fps: measuredFps,
      loadBlackFrames,
      errors,
      transition,
      export: { included: false }
    });
  }

  const project = createDefaultProject();
  project.name = "Audit 10 preset reali";
  project.audioFile = assets.audio60;
  project.exportSettings.width = 180;
  project.exportSettings.height = 320;
  project.exportSettings.fps = 30;
  project.exportSettings.videoBitrate = "2M";
  project.projectM.presetId = "audit-1";
  project.projectM.sequenceStartPresetId = "audit-1";
  project.projectM.presetPath = records[0].originalPath;
  project.projectM.playlistIds = records.map((record) => `audit-${record.index}`);
  project.projectM.randomSeed = 0x5a17f20a;
  project.projectM.autoSwitch.enabled = true;
  project.projectM.autoSwitch.mode = "interval";
  project.projectM.autoSwitch.order = "sequential";
  project.projectM.autoSwitch.intervalSeconds = 6;
  project.projectM.autoSwitch.minimumSeconds = 6;
  project.projectM.autoSwitch.maximumSeconds = 6;
  project.projectM.transition.enabled = true;
  project.projectM.transition.durationSeconds = 0.75;
  const outputMp4 = path.join(outputDirectory, "ten-real-presets.mp4");
  const args = [
    "-hide_banner", "-y",
    "-f", "rawvideo", "-pixel_format", "rgba",
    "-video_size", "180x320", "-framerate", "30", "-i", "pipe:0",
    "-i", assets.audio60,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libopenh264", "-profile:v", "high",
    "-allow_skip_frames", "0", "-rc_mode", "bitrate",
    "-b:v", "2M", "-r", "30",
    "-c:a", "aac", "-b:a", "192k", "-shortest", outputMp4
  ];
  const runtime = await renderProjectMExport(
    null,
    ffmpeg,
    args,
    project,
    records.map(presetRecord),
    { progress: () => {}, warning: () => {} }
  );
  const exportMetrics = await runtime.completion;
  const exportedIds = new Set(exportMetrics.sequence.map((entry) => entry.presetId));
  for (const preset of perPreset) {
    preset.export = {
      included: exportedIds.has(`audit-${preset.index}`),
      output: outputMp4
    };
  }
  const probe = spawnSync(
    ffmpeg,
    ["-hide_banner", "-i", outputMp4, "-f", "null", "NUL"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
  const probeText = `${probe.stdout || ""}\n${probe.stderr || ""}`;
  const report = {
    generatedAt: new Date().toISOString(),
    projectM: engineStatus,
    sourceArchiveSha256: assets.archiveSha256,
    presetCount: perPreset.length,
    presets: perPreset,
    export: {
      output: outputMp4,
      bytes: fs.statSync(outputMp4).size,
      h264: /Video: h264/i.test(probeText),
      aac: /Audio: aac/i.test(probeText),
      allPresetsIncluded: perPreset.every((preset) => preset.export.included),
      metrics: exportMetrics
    }
  };
  const reportPath = path.join(outputDirectory, "ten-real-presets-report.json");
  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.export.allPresetsIncluded || exportMetrics.errors.length) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
