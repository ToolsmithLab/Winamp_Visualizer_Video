"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createCanvas } = require("@napi-rs/canvas");
const { createDefaultProject } = require("../dist/shared/project");
const { SceneCompositor } = require("../dist/engine/composition/sceneCompositor");
const { pluginRegistry } = require("../dist/engine/plugins/registry");

const output = path.resolve(
  process.argv[2] || "test-results/phase3-m2/plugin-soak-600s.json"
);
const ids = [
  "radialRays",
  "mirroredWaveform",
  "audioGrid",
  "orbitingParticles"
];
const width = 120;
const height = 200;
const fps = 30;
const frames = 600 * fps;

function layer(id, index) {
  const descriptor = pluginRegistry.get(id);
  return {
    id: `soak-${id}`,
    name: descriptor.displayName,
    kind: "visualizer",
    pluginId: id,
    plugin: {
      id,
      version: descriptor.version,
      settings: structuredClone(descriptor.defaultSettings)
    },
    visible: true,
    locked: false,
    opacity: 0.72,
    blendMode: ["source-over", "screen", "lighter", "overlay"][index],
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

const reusableSpectrum = new Uint8Array(128);
const reusableWaveform = new Uint8Array(128);
const reusableAudio = {
  volume: 0,
  bass: 0,
  mid: 0,
  high: 0,
  spectrum: reusableSpectrum,
  waveform: reusableWaveform
};

function audio(frame) {
  for (let index = 0; index < 128; index += 1) {
    reusableSpectrum[index] = Math.round(
      30 + 210 * Math.abs(Math.sin(index * 0.08 + frame * 0.013))
    );
    reusableWaveform[index] = Math.round(
      128 + 94 * Math.sin(index * 0.12 + frame * 0.017)
    );
  }
  reusableAudio.volume = 0.25 + 0.55 * Math.abs(Math.sin(frame * 0.007));
  reusableAudio.bass = 0.2 + 0.7 * Math.abs(Math.sin(frame * 0.011));
  reusableAudio.mid = 0.18 + 0.64 * Math.abs(Math.sin(frame * 0.017));
  reusableAudio.high = 0.12 + 0.58 * Math.abs(Math.sin(frame * 0.023));
  return reusableAudio;
}

function activeHandles() {
  return typeof process._getActiveHandles === "function"
    ? process._getActiveHandles().length
    : 0;
}

const canvas = createCanvas(width, height);
const context = canvas.getContext("2d");
const project = createDefaultProject();
project.layers = ids.map(layer);
const compositor = new SceneCompositor();
const timings = [];
const samples = [];
const started = performance.now();
for (let frame = 0; frame < frames; frame += 1) {
  const frameStarted = performance.now();
  compositor.render(
    context,
    width,
    height,
    project,
    audio(frame),
    frame / fps,
    { projectM: null, cover: null },
    { frameRate: fps }
  );
  timings.push(performance.now() - frameStarted);
  if (frame % 900 === 0 || frame === frames - 1) {
    // Flush only at samples: preview does not copy the complete bitmap on
    // every frame, and this soak measures plugin state rather than the
    // separately benchmarked export readback buffer.
    canvas.data();
    global.gc?.();
    const memory = process.memoryUsage();
    samples.push({
      frame,
      time: frame / fps,
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers,
      activeHandles: activeHandles()
    });
  }
}
const disposeStarted = performance.now();
compositor.dispose();
const disposeMs = performance.now() - disposeStarted;
global.gc?.();
const afterDisposeMemory = process.memoryUsage();
timings.sort((a, b) => a - b);
const averageMs = timings.reduce((sum, value) => sum + value, 0) / timings.length;
const report = {
  generatedAt: new Date().toISOString(),
  timelineSeconds: 600,
  fps,
  frames,
  width,
  height,
  pluginIds: ids,
  elapsedMs: performance.now() - started,
  averageRenderMs: averageMs,
  p95RenderMs: timings[Math.floor(timings.length * 0.95)],
  effectiveOfflineFps: 1000 / averageMs,
  disposeMs,
  memory: {
    first: samples[0],
    last: samples.at(-1),
    peakRss: Math.max(...samples.map(({ rss }) => rss)),
    peakHeapUsed: Math.max(...samples.map(({ heapUsed }) => heapUsed)),
    peakExternal: Math.max(...samples.map(({ external }) => external)),
    peakHandles: Math.max(...samples.map(({ activeHandles }) => activeHandles)),
    monotonicRssGrowth: samples.every(
      (sample, index) => index === 0 || sample.rss >= samples[index - 1].rss
    ),
    retainedRssGrowthBytes: samples.at(-1).rss - samples[0].rss,
    afterDispose: {
      rss: afterDisposeMemory.rss,
      heapUsed: afterDisposeMemory.heapUsed,
      external: afterDisposeMemory.external,
      arrayBuffers: afterDisposeMemory.arrayBuffers,
      activeHandles: activeHandles()
    }
  },
  samples
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (
  report.memory.monotonicRssGrowth &&
  report.memory.retainedRssGrowthBytes > 32 * 1024 * 1024
) {
  process.exitCode = 2;
}
