"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { createDefaultProject } = require("../dist/shared/project");
const {
  renderProjectMExport
} = require("../dist/main/projectm/projectMExportRenderer");
const {
  pluginRegistry
} = require("../dist/engine/plugins/registry");

const root = path.resolve(__dirname, "..");
const ffmpeg = path.join(root, "native", "ffmpeg", "win-x64", "ffmpeg.exe");
const width = Number(process.argv[2] || 1080);
const height = Number(process.argv[3] || 1920);
const fps = Number(process.argv[4] || 30);
const duration = Number(process.argv[5] || 60);
const mode = process.argv[7] || "";
const m3Mode = mode === "m3";
const m2Mode = mode === "m2" || m3Mode;
const label = `${m3Mode ? "m3-" : m2Mode ? "m2-" : ""}${width}x${height}-${fps}fps-${duration}s`;
const parityRoot = process.argv[6]
  ? path.resolve(process.argv[6])
  : path.join(root, "test-results", "phase2", "parity");
const outputDirectory = path.join(parityRoot, label);
const destination = path.join(outputDirectory, "reference.mp4");
const reportPath = path.join(outputDirectory, "report.json");
const audioPath = path.join(outputDirectory, "reference.wav");
const coverPath = path.join(outputDirectory, "cover.png");
const captureTimes = [
  ...new Set(
    [
      0,
      ...(m2Mode
        ? [
            duration * 0.1,
            duration * 0.25,
            duration * 0.5,
            duration * 0.75,
            duration * 0.9,
            duration / 3,
            duration / 3 + 0.75,
            duration / 3 + 1.5,
            (duration * 2) / 3,
            (duration * 2) / 3 + 0.75,
            (duration * 2) / 3 + 1.5,
            3,
            6,
            duration - 3,
            ...(m3Mode
              ? [
                  5 - 1 / fps,
                  5,
                  5 + 1 / fps,
                  15,
                  30,
                  45,
                  duration - 1 / fps
                ]
              : [])
          ]
        : [
            duration * 0.25,
            duration / 3,
            duration * 0.5,
            (duration * 2) / 3,
            duration * 0.75
          ]),
      Math.max(0, duration - 1 / fps)
    ].map((value) => Number(value.toFixed(6)))
  )
].sort((a, b) => a - b);

function run(arguments_, options = {}) {
  const result = spawnSync(ffmpeg, arguments_, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `FFmpeg exit ${result.status}`);
  }
  return result;
}

function createAudio() {
  run([
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=72:sample_rate=48000:duration=${duration}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:sample_rate=48000:duration=${duration}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=2200:sample_rate=48000:duration=${duration}`,
    "-filter_complex",
    "[0:a]volume=0.65[a0];[1:a]volume=0.3[a1];[2:a]volume=0.18[a2];" +
      "[a0][a1][a2]amix=inputs=3:normalize=0," +
      "apulsator=hz=1.2:amount=0.55,alimiter=limit=0.92[a]",
    "-map",
    "[a]",
    "-c:a",
    "pcm_s16le",
    audioPath
  ]);
}

function createCover() {
  const canvas = createCanvas(900, 900);
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 900, 900);
  gradient.addColorStop(0, "#ff397d");
  gradient.addColorStop(0.5, "#6d36dd");
  gradient.addColorStop(1, "#00c7d9");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 900, 900);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.font = "700 102px Segoe UI";
  context.fillText("PHASE 2", 450, 420);
  context.font = "600 44px Segoe UI";
  context.fillText("PREVIEW / EXPORT", 450, 500);
  fs.writeFileSync(coverPath, canvas.toBuffer("image/png"));
}

function presetRecord(id, name, presetPath) {
  return {
    id,
    name,
    author: null,
    path: presetPath,
    origin: { kind: "internal", sourcePath: presetPath, label: "Parity test" },
    importedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    hash: id,
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

function processSample(pids) {
  const ids = pids.filter(Boolean).join(",");
  if (!ids) return [];
  const command =
    `$p=Get-Process -Id ${ids} -ErrorAction SilentlyContinue;` +
    "$p|Select-Object Id,CPU,WorkingSet64,PrivateMemorySize64,HandleCount|" +
    "ConvertTo-Json -Compress";
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    { encoding: "utf8", timeout: 10_000 }
  );
  if (result.status !== 0 || !result.stdout.trim()) return [];
  const parsed = JSON.parse(result.stdout.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

function gpuSample() {
  const command =
    "$v=(Get-Counter '\\GPU Engine(*)\\Utilization Percentage' " +
    "-ErrorAction SilentlyContinue).CounterSamples.CookedValue;" +
    "[math]::Round(($v|Measure-Object -Maximum).Maximum,2)";
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    { encoding: "utf8", timeout: 10_000 }
  );
  const value = Number(result.stdout.trim().replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

async function compareImages(firstPath, secondPath) {
  const [first, second] = await Promise.all([
    loadImage(firstPath),
    loadImage(secondPath)
  ]);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(first, 0, 0, width, height);
  const a = Buffer.from(canvas.data());
  context.clearRect(0, 0, width, height);
  context.drawImage(second, 0, 0, width, height);
  const b = canvas.data();
  let absolute = 0;
  let square = 0;
  let maximum = 0;
  for (let offset = 0; offset < a.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = Math.abs(
        (a[offset + channel] ?? 0) - (b[offset + channel] ?? 0)
      );
      absolute += difference;
      square += difference * difference;
      maximum = Math.max(maximum, difference);
    }
  }
  const samples = (a.length / 4) * 3;
  const mse = square / samples;
  return {
    meanAbsoluteError: absolute / samples,
    rootMeanSquareError: Math.sqrt(mse),
    psnr: mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse),
    maximumChannelError: maximum
  };
}

async function main() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  createAudio();
  createCover();
  const presetPaths = [
    path.join(root, "tests", "fixtures", "preset-import", "parity-one.milk"),
    path.join(root, "tests", "fixtures", "preset-import", "parity-two.milk"),
    path.join(root, "tests", "fixtures", "preset-import", "parity-third.milk")
  ];
  const records = [
    presetRecord("parity-one", "Fixture Cyan", presetPaths[0]),
    presetRecord("parity-two", "Fixture Red", presetPaths[1]),
    presetRecord("parity-three", "Fixture Magenta", presetPaths[2])
  ];
  const project = createDefaultProject();
  project.name = m3Mode
    ? "Golden project Fase 3 M3 · Ω"
    : m2Mode
      ? "Golden project Fase 3 M2"
    : "Riferimento parità Fase 2";
  project.audioFile = audioPath;
  project.cover.filePath = coverPath;
  project.cover.opacity = 0.84;
  project.cover.x = 0.28;
  project.cover.y = 0.29;
  project.cover.width = 0.4;
  project.cover.height = 0.25;
  project.text.artist = "ARTISTA DI RIFERIMENTO";
  project.text.title = "Parità Preview / Export";
  project.exportSettings = {
    width,
    height,
    fps,
    videoBitrate: "16M",
    audioBitrate: "256k"
  };
  project.canvas.width = width;
  project.canvas.height = height;
  project.canvas.fps = fps;
  project.projectM.presetId = records[0].id;
  project.projectM.sequenceStartPresetId = records[0].id;
  project.projectM.presetPath = records[0].path;
  project.projectM.playlistIds = records.map(({ id }) => id);
  project.projectM.randomSeed = 0x51a7c0de;
  project.projectM.particleSeed = 0x1badb002;
  project.projectM.autoSwitch.enabled = true;
  project.projectM.autoSwitch.mode = "interval";
  project.projectM.autoSwitch.order = "sequential";
  project.projectM.autoSwitch.intervalSeconds = duration / 3;
  project.projectM.autoSwitch.minimumSeconds = duration / 3;
  project.projectM.autoSwitch.maximumSeconds = duration / 3;
  project.projectM.transition.enabled = true;
  project.projectM.transition.durationSeconds = 1.5;

  if (m2Mode) {
    for (const id of [
      "radialRays",
      "mirroredWaveform",
      "audioGrid",
      "orbitingParticles"
    ]) {
      const descriptor = pluginRegistry.get(id);
      project.layers.push({
        id: `visualizer-${id}`,
        name: descriptor.displayName,
        kind: "visualizer",
        pluginId: id,
        plugin: {
          id,
          version: descriptor.version,
          settings: structuredClone(descriptor.defaultSettings)
        },
        visible: true,
        locked: id === "audioGrid",
        opacity: 0.58,
        blendMode: "screen",
        startTime: id === "audioGrid" ? 3 : 0,
        endTime: id === "mirroredWaveform" ? duration - 3 : null,
        reactive: {
          band: "volume",
          sensitivity: 1,
          smoothing: 0.72,
          intensity: 1,
          color: "#8b5cf6"
        },
        transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
        keyframes: []
      });
    }
    const particle = visualizer(project, "particleBurst");
    const duplicate = structuredClone(particle);
    duplicate.id = "visualizer-particleBurst-second";
    duplicate.name = "Particle Burst seconda istanza";
    duplicate.visible = true;
    duplicate.opacity = 0.62;
    project.layers.push(duplicate);
  }
  const visibleOverlays = new Set(
    m2Mode
      ? [
          "spectrumBars",
          "circularSpectrum",
          "waveformLine",
          "particleBurst",
          "dynamicVignette",
          "radialRays",
          "mirroredWaveform",
          "audioGrid",
          "orbitingParticles"
        ]
      : ["spectrumBars", "circularSpectrum", "waveformLine"]
  );
  for (const layer of project.layers) {
    if (layer.kind === "visualizer") {
      layer.visible = visibleOverlays.has(layer.pluginId);
      layer.opacity =
        layer.pluginId === "spectrumBars"
          ? 0.82
          : layer.pluginId === "circularSpectrum"
            ? 0.68
            : 0.74;
    }
  }
  visualizer(project, "circularSpectrum").startTime = 3;
  visualizer(project, "circularSpectrum").endTime = duration - 3;
  visualizer(project, "waveformLine").startTime = 6;
  if (m2Mode) {
    const blendModes = [
      "source-over",
      "screen",
      "lighter",
      "multiply",
      "overlay",
      "lighten",
      "darken"
    ];
    project.layers
      .filter((layer) => layer.kind === "visualizer")
      .forEach((layer, index) => {
        layer.blendMode = blendModes[index % blendModes.length];
      });
  }
  project.layers.find((layer) => layer.kind === "cover").opacity = 0.9;
  project.layers.find((layer) => layer.kind === "titleText").opacity = 0.94;
  project.layers.find((layer) => layer.kind === "artistText").opacity = 0.76;
  if (m3Mode) {
    const coverLayer = project.layers.find((layer) => layer.kind === "cover");
    const artistLayer = project.layers.find((layer) => layer.kind === "artistText");
    const titleLayer = project.layers.find((layer) => layer.kind === "titleText");
    coverLayer.transform = {
      x: 0.28,
      y: 0.29,
      scaleX: 1.12,
      scaleY: 0.82,
      rotation: -12
    };
    artistLayer.transform = {
      x: 0.52,
      y: 0.59,
      scaleX: 1.05,
      scaleY: 1.05,
      rotation: 7
    };
    titleLayer.transform = {
      x: 0.5,
      y: 0.66,
      scaleX: 0.94,
      scaleY: 0.94,
      rotation: -4
    };
    coverLayer.keyframes = [
      { id: "m3-x-00", property: "x", time: 0, value: 0.28, interpolation: "linear" },
      { id: "m3-x-15", property: "x", time: 15, value: 0.72, interpolation: "ease-in" },
      { id: "m3-x-30", property: "x", time: 30, value: 0.5, interpolation: "ease-out" },
      { id: "m3-y-00", property: "y", time: 0, value: 0.29, interpolation: "hold" },
      { id: "m3-y-30", property: "y", time: 30, value: 0.38, interpolation: "ease-in-out" },
      { id: "m3-scale-05-before", property: "scale", time: 5 - 1 / fps, value: 0.8, interpolation: "linear" },
      { id: "m3-scale-05", property: "scale", time: 5, value: 1.25, interpolation: "ease-in-out" },
      { id: "m3-scale-05-after", property: "scale", time: 5 + 1 / fps, value: 0.9, interpolation: "linear" },
      { id: "m3-rotation-00", property: "rotation", time: 0, value: -12, interpolation: "linear" },
      { id: "m3-rotation-45", property: "rotation", time: 45, value: 33, interpolation: "ease-out" },
      { id: "m3-opacity-start", property: "opacity", time: coverLayer.startTime, value: 0.9, interpolation: "hold" },
      { id: "m3-opacity-end", property: "opacity", time: duration - 1 / fps, value: 0.62, interpolation: "linear" }
    ];
    artistLayer.keyframes = [
      { id: "m3-artist-x", property: "x", time: 0, value: 0.52, interpolation: "linear" },
      { id: "m3-artist-rotation", property: "rotation", time: 30, value: -8, interpolation: "ease-in-out" }
    ];
    titleLayer.keyframes = [
      { id: "m3-title-y", property: "y", time: 6, value: 0.66, interpolation: "ease-out" },
      { id: "m3-title-opacity", property: "opacity", time: duration - 3, value: 0.4, interpolation: "hold" }
    ];
    const intensityLayer = visualizer(project, "radialRays");
    intensityLayer.keyframes = [
      { id: "m3-intensity-00", property: "intensity", time: 0, value: 0.5, interpolation: "linear" },
      { id: "m3-intensity-30", property: "intensity", time: 30, value: 1.8, interpolation: "ease-in-out" },
      { id: "m3-intensity-end", property: "intensity", time: duration - 1 / fps, value: 0.8, interpolation: "hold" }
    ];
  }
  const order = [
    "projectm",
    "visualizer-circularSpectrum",
    "cover",
    "visualizer-spectrumBars",
    "artist-text",
    "visualizer-waveformLine",
    "title-text"
  ];
  project.layers.sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  fs.writeFileSync(
    path.join(outputDirectory, "reference.avsproject"),
    `${JSON.stringify(project, null, 2)}\n`,
    "utf8"
  );

  const args = [
    "-hide_banner",
    "-y",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    `${width}x${height}`,
    "-framerate",
    String(fps),
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
    "-maxrate",
    project.exportSettings.videoBitrate,
    "-bufsize",
    "32M",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-fps_mode",
    "cfr",
    "-video_track_timescale",
    "90000",
    "-c:a",
    "aac",
    "-b:a",
    project.exportSettings.audioBitrate,
    "-movflags",
    "+faststart",
    "-shortest",
    destination
  ];
  const capturedFrameIndices = new Map();
  const runtime = await renderProjectMExport(
    null,
    ffmpeg,
    args,
    project,
    records,
    {
      progress: (frame, message) => {
        process.stdout.write(`${frame}/${duration * fps} ${message}\n`);
      },
      warning: (message) => {
        process.stderr.write(`WARNING ${message}\n`);
      },
      captureTimestamps: captureTimes,
      capture: (timestamp, frame, png, projectMPng) => {
        capturedFrameIndices.set(timestamp, frame);
        fs.writeFileSync(
          path.join(outputDirectory, `preview-${timestamp.toFixed(3)}.png`),
          png
        );
        if (projectMPng) {
          fs.writeFileSync(
            path.join(outputDirectory, `projectm-${timestamp.toFixed(3)}.png`),
            projectMPng
          );
        }
      }
    }
  );
  const samples = [];
  const gpu = [];
  const sampler = setInterval(() => {
    samples.push(processSample([process.pid, runtime.encoder.pid, runtime.host?.pid]));
    const currentGpu = gpuSample();
    if (currentGpu !== null) gpu.push(currentGpu);
  }, 5_000);
  const metrics = await runtime.completion;
  clearInterval(sampler);
  samples.push(processSample([process.pid]));

  const comparisons = [];
  for (const timestamp of captureTimes) {
    const frameIndex = capturedFrameIndices.get(timestamp);
    if (!Number.isInteger(frameIndex)) {
      throw new Error(`Indice frame catturato assente per ${timestamp}.`);
    }
    const exportFrame = path.join(
      outputDirectory,
      `export-${timestamp.toFixed(3)}.png`
    );
    run([
      "-hide_banner",
      "-y",
      "-i",
      destination,
      "-vf",
      `select=eq(n\\,${frameIndex})`,
      "-fps_mode",
      "passthrough",
      "-frames:v",
      "1",
      exportFrame
    ]);
    const previewFrame = path.join(
      outputDirectory,
      `preview-${timestamp.toFixed(3)}.png`
    );
    comparisons.push({
      timestamp,
      frameIndex,
      frameTimestamp: frameIndex / fps,
      previewFrame,
      exportFrame,
      ...(await compareImages(previewFrame, exportFrame))
    });
  }

  const probe = run(["-hide_banner", "-i", destination, "-f", "null", "NUL"]);
  const inspection = probe.stderr;
  const artifact = fs.statSync(destination);
  const flattened = samples.flat();
  const peak = (field) =>
    flattened.reduce((maximum, sample) => Math.max(maximum, sample[field] || 0), 0);
  const report = {
    generatedAt: new Date().toISOString(),
    profile: { width, height, fps, duration },
    output: destination,
    outputBytes: artifact.size,
    referenceProject: path.join(outputDirectory, "reference.avsproject"),
    codec: {
      h264: /Video: h264/i.test(inspection),
      aac: /Audio: aac/i.test(inspection)
    },
    referenceRequirements: {
      realProjectM: true,
      rawProjectMFrames: captureTimes.map((timestamp) =>
        path.join(outputDirectory, `projectm-${timestamp.toFixed(3)}.png`)
      ),
      presetCount: records.length,
      transitionCount: metrics.presetChanges,
      cover: true,
      artist: true,
      title: true,
      visibleCanvasOverlays: [...visibleOverlays],
      canvasPluginCount: new Set(
        project.layers
          .filter((layer) => layer.kind === "visualizer")
          .map((layer) => layer.pluginId)
      ).size,
      canvasPluginInstanceCount: project.layers.filter(
        (layer) => layer.kind === "visualizer"
      ).length,
      hiddenLayers: project.layers
        .filter((layer) => !layer.visible)
        .map(({ id }) => id),
      reorderedLayers: project.layers.map(({ id }) => id),
      intervals: project.layers
        .filter((layer) => layer.startTime || layer.endTime !== null)
        .map(({ id, startTime, endTime }) => ({ id, startTime, endTime })),
      opacities: project.layers.map(({ id, opacity }) => ({ id, opacity })),
      blendModes: project.layers.map(({ id, blendMode }) => ({ id, blendMode })),
      seed: project.projectM.randomSeed,
      particleSeed: project.projectM.particleSeed
    },
    systemMetrics: {
      peakWorkingSetBytes: peak("WorkingSet64"),
      peakPrivateMemoryBytes: peak("PrivateMemorySize64"),
      peakHandles: peak("HandleCount"),
      peakGpuPercent: gpu.length ? Math.max(...gpu) : null,
      temporaryFilesBytes: 0,
      sampleCount: flattened.length
    },
    comparisons,
    ...metrics
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!report.codec.h264 || !report.codec.aac) process.exitCode = 2;
  if (metrics.frames !== duration * fps) process.exitCode = 3;
  if (metrics.presetChanges < 2) process.exitCode = 4;
  if (metrics.blackFrames !== 0) process.exitCode = 5;
  if (comparisons.some((comparison) => comparison.psnr < 28)) {
    process.exitCode = 6;
  }
}

function visualizer(project, pluginId) {
  return project.layers.find(
    (layer) => layer.kind === "visualizer" && layer.pluginId === pluginId
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
