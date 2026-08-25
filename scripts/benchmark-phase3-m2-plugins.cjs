"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createCanvas } = require("@napi-rs/canvas");
const { createDefaultProject } = require("../dist/shared/project");
const {
  SceneCompositor
} = require("../dist/engine/composition/sceneCompositor");
const { pluginRegistry } = require("../dist/engine/plugins/registry");

const root = path.resolve(__dirname, "..");
const output = path.resolve(
  process.argv[2] || "test-results/phase3-m2/plugin-performance.json"
);
const pluginIds = pluginRegistry.list().map(({ id }) => id);

function layerFor(descriptor) {
  return {
    id: `benchmark-${descriptor.id}`,
    name: descriptor.displayName,
    kind: "visualizer",
    pluginId: descriptor.id,
    plugin: {
      id: descriptor.id,
      version: descriptor.version,
      settings: structuredClone(descriptor.defaultSettings)
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "source-over",
    startTime: 0,
    endTime: null,
    reactive: {
      band: "volume",
      sensitivity: 1,
      smoothing: 0.72,
      intensity: 1,
      color: "#8b5cf6"
    },
    transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
    keyframes: []
  };
}

function audio(frame) {
  const spectrum = new Uint8Array(256);
  const waveform = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) {
    spectrum[index] = Math.round(
      48 + 180 * Math.abs(Math.sin(index * 0.071 + frame * 0.11))
    );
    waveform[index] = Math.round(
      128 + 92 * Math.sin(index * 0.13 + frame * 0.17)
    );
  }
  return {
    volume: 0.61,
    bass: 0.74,
    mid: 0.49,
    high: 0.38,
    spectrum,
    waveform
  };
}

function percentile(samples, proportion) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * proportion))];
}

function benchmark(descriptor, width, height, frames) {
  global.gc?.();
  const before = process.memoryUsage();
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  const project = createDefaultProject();
  project.layers = [layerFor(descriptor)];
  const compositor = new SceneCompositor();
  const timings = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const started = performance.now();
    compositor.render(
      context,
      width,
      height,
      project,
      audio(frame),
      frame / 30,
      { projectM: null, cover: null },
      { frameRate: 30 }
    );
    canvas.data();
    timings.push(performance.now() - started);
  }
  const disposeStarted = performance.now();
  compositor.dispose();
  const disposeMs = performance.now() - disposeStarted;
  global.gc?.();
  const after = process.memoryUsage();
  return {
    width,
    height,
    frames,
    averageRenderMs:
      timings.reduce((sum, value) => sum + value, 0) / timings.length,
    p95RenderMs: percentile(timings, 0.95),
    maximumRenderMs: Math.max(...timings),
    estimatedFps: 1000 /
      (timings.reduce((sum, value) => sum + value, 0) / timings.length),
    disposeMs,
    memoryDeltaBytes: {
      rss: after.rss - before.rss,
      heapUsed: after.heapUsed - before.heapUsed,
      external: after.external - before.external,
      arrayBuffers: after.arrayBuffers - before.arrayBuffers
    },
    allocationNote:
      "Delta di memoria del ciclo completo; le allocazioni native per singolo frame non sono osservabili direttamente da V8."
  };
}

function benchmarkStack(width, height, frames, blendModes) {
  global.gc?.();
  const before = process.memoryUsage();
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  const project = createDefaultProject();
  project.layers = pluginRegistry.list().map((descriptor, index) => ({
    ...layerFor(descriptor),
    id: `benchmark-stack-${descriptor.id}`,
    opacity: 0.74,
    blendMode: blendModes[index % blendModes.length]
  }));
  const compositor = new SceneCompositor();
  const timings = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const started = performance.now();
    compositor.render(
      context,
      width,
      height,
      project,
      audio(frame),
      frame / 30,
      { projectM: null, cover: null },
      { frameRate: 30 }
    );
    // Force Skia to rasterize the complete command list, as the offline
    // compositor does before writing each RGBA frame to FFmpeg.
    canvas.data();
    timings.push(performance.now() - started);
  }
  const disposeStarted = performance.now();
  compositor.dispose();
  const disposeMs = performance.now() - disposeStarted;
  global.gc?.();
  const after = process.memoryUsage();
  return {
    width,
    height,
    frames,
    blendModes,
    averageRenderMs:
      timings.reduce((sum, value) => sum + value, 0) / timings.length,
    p95RenderMs: percentile(timings, 0.95),
    maximumRenderMs: Math.max(...timings),
    disposeMs,
    memoryDeltaBytes: {
      rss: after.rss - before.rss,
      heapUsed: after.heapUsed - before.heapUsed,
      external: after.external - before.external,
      arrayBuffers: after.arrayBuffers - before.arrayBuffers
    }
  };
}

const results = [];
for (const id of pluginIds) {
  const descriptor = pluginRegistry.get(id);
  results.push({
    id,
    preview: benchmark(descriptor, 270, 480, 80),
    export1080x1920: benchmark(descriptor, 1080, 1920, 6)
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  garbageCollectorExposed: typeof global.gc === "function",
  pluginCount: pluginIds.length,
  results,
  combinedStacks: {
    previewSevenBlendModes: benchmarkStack(270, 480, 80, [
      "source-over",
      "screen",
      "lighter",
      "multiply",
      "overlay",
      "lighten",
      "darken"
    ]),
    sourceOver: benchmarkStack(1080, 1920, 6, ["source-over"]),
    sevenBlendModes: benchmarkStack(1080, 1920, 6, [
      "source-over",
      "screen",
      "lighter",
      "multiply",
      "overlay",
      "lighten",
      "darken"
    ])
  }
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
