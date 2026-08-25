"use strict";

const crypto = require("node:crypto");
const { createCanvas } = require("@napi-rs/canvas");
const { SceneCompositor } = require("../dist/engine/composition/sceneCompositor");
const { pluginRegistry } = require("../dist/engine/plugins/registry");
const { createDefaultProject } = require("../dist/shared/project");

const ids = [
  "radialRays",
  "mirroredWaveform",
  "audioGrid",
  "orbitingParticles"
];

function audio(variant) {
  const spectrum = new Uint8Array(128);
  const waveform = new Uint8Array(128);
  for (let index = 0; index < 128; index += 1) {
    spectrum[index] =
      variant === 1
        ? Math.round((Math.sin(index * 0.17) * 0.5 + 0.5) * 230)
        : Math.round((Math.cos(index * 0.31) * 0.5 + 0.5) * 90);
    waveform[index] =
      128 +
      Math.round(
        Math.sin(index * (variant === 1 ? 0.23 : 0.08)) *
          (variant === 1 ? 82 : 25)
      );
  }
  return {
    volume: variant === 1 ? 0.72 : 0.16,
    bass: variant === 1 ? 0.81 : 0.09,
    mid: variant === 1 ? 0.58 : 0.14,
    high: variant === 1 ? 0.43 : 0.08,
    spectrum,
    waveform
  };
}

function layer(id) {
  const descriptor = pluginRegistry.get(id);
  return {
    id: `golden-${id}`,
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

function hashFrame(id, variant) {
  const canvas = createCanvas(180, 320);
  const context = canvas.getContext("2d");
  const project = createDefaultProject();
  project.modifiedAt = "1970-01-01T00:00:00.000Z";
  project.canvas.width = 180;
  project.canvas.height = 320;
  project.layers = [layer(id)];
  const compositor = new SceneCompositor();
  compositor.render(
    context,
    180,
    320,
    project,
    audio(variant),
    12.5,
    { projectM: null, cover: null },
    { frameRate: 30 }
  );
  compositor.dispose();
  return crypto.createHash("sha256").update(canvas.data()).digest("hex");
}

const result = {
  format: 1,
  width: 180,
  height: 320,
  timestamp: 12.5,
  projectSeed: 305419896,
  highEnergy: Object.fromEntries(ids.map((id) => [id, hashFrame(id, 1)])),
  lowEnergy: Object.fromEntries(ids.map((id) => [id, hashFrame(id, 2)]))
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
