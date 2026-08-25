"use strict";

// Strumento deliberatamente read-only: stampa i candidati golden su stdout.
// Non modifica mai le fixture; ogni aggiornamento richiede review e apply_patch.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");
const {
  createDefaultProject
} = require("../dist/shared/project");
const {
  analyzePcm,
  emptyAudioSnapshot
} = require("../dist/shared/audioAnalysis");
const {
  SceneCompositor
} = require("../dist/engine/composition/sceneCompositor");
const {
  OfflineSceneCompositor
} = require("../dist/main/export/offlineSceneCompositor");

const root = path.resolve(__dirname, "..");
const pluginIds = [
  "spectrumBars",
  "circularSpectrum",
  "waveformLine",
  "particleBurst",
  "pulseShapes",
  "dynamicVignette"
];

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function syntheticSnapshot() {
  const pcm = new Float32Array(4096);
  for (let frame = 0; frame < pcm.length / 2; frame += 1) {
    const sample =
      Math.sin((2 * Math.PI * 110 * frame) / 48_000) * 0.55 +
      Math.sin((2 * Math.PI * 880 * frame) / 48_000) * 0.25;
    pcm[frame * 2] = sample;
    pcm[frame * 2 + 1] = sample * 0.93;
  }
  return analyzePcm(pcm, 2, 48_000);
}

function hotSnapshot(snapshot) {
  return {
    ...snapshot,
    volume: 1,
    bass: 1,
    mid: Math.max(0.8, snapshot.mid),
    high: Math.max(0.7, snapshot.high)
  };
}

function decodePcm16Wav(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Fixture WAV non valida.");
  }
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let data;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      const format = bytes.readUInt16LE(start);
      if (format !== 1) throw new Error(`Formato WAV non PCM: ${format}`);
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
      bits = bytes.readUInt16LE(start + 14);
    } else if (id === "data") {
      data = bytes.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!data || bits !== 16 || !channels || !sampleRate) {
    throw new Error("Fixture WAV PCM16 incompleta.");
  }
  const pcm = new Float32Array(data.length / 2);
  for (let index = 0; index < pcm.length; index += 1) {
    pcm[index] = data.readInt16LE(index * 2) / 32768;
  }
  return { pcm, channels, sampleRate };
}

function realSnapshot() {
  const decoded = decodePcm16Wav(
    path.join(root, "tests", "fixtures", "audio", "phase2-multiband.wav")
  );
  return analyzePcm(decoded.pcm, decoded.channels, decoded.sampleRate);
}

function projectFor(pluginId) {
  const project = createDefaultProject();
  project.projectM.enabled = false;
  for (const layer of project.layers) {
    if (layer.kind === "projectM" || layer.kind === "cover" ||
        layer.kind === "artistText" || layer.kind === "titleText") {
      layer.visible = false;
    }
    if (layer.kind === "visualizer") layer.visible = layer.pluginId === pluginId;
  }
  return project;
}

function renderSequence(pluginId, snapshot) {
  const compositor = new OfflineSceneCompositor(180, 320);
  const project = projectFor(pluginId);
  let frame;
  const times = [0, 1 / 30, 2 / 30, 3 / 30, 4 / 30, 5 / 30, 0.5, 1];
  for (let index = 0; index < times.length; index += 1) {
    frame = compositor.render(
      project,
      pluginId === "particleBurst" && index === 0
        ? emptyAudioSnapshot()
        : pluginId === "particleBurst"
          ? hotSnapshot(snapshot)
          : snapshot,
      times[index],
      30,
      false
    );
  }
  const result = hash(frame);
  compositor.dispose();
  return result;
}

function previewOffline(pluginId, snapshot) {
  const project = projectFor(pluginId);
  const offline = new OfflineSceneCompositor(180, 320);
  const offlineFrame = offline.render(project, snapshot, 1.25, 30, false);
  const canvas = createCanvas(180, 320);
  const context = canvas.getContext("2d");
  const visualizerCanvas = createCanvas(180, 320);
  const visualizerContext = visualizerCanvas.getContext("2d");
  const preview = new SceneCompositor();
  preview.render(
    context,
    180,
    320,
    project,
    snapshot,
    1.25,
    {
      projectM: null,
      cover: null,
      visualizer: {
        canvas: visualizerCanvas,
        context: visualizerContext
      }
    },
    { frameRate: 30 }
  );
  const previewFrame = canvas.data();
  const result = {
    preview: hash(previewFrame),
    offline: hash(offlineFrame),
    equal: Buffer.from(previewFrame).equals(Buffer.from(offlineFrame))
  };
  offline.dispose();
  return result;
}

function seekGolden(snapshot) {
  const project = projectFor("particleBurst");
  const compositor = new OfflineSceneCompositor(180, 320);
  const hashes = [];
  const times = [0, 1 / 30, 2 / 30, 3 / 30, 1, 0.25, 0.5];
  for (let index = 0; index < times.length; index += 1) {
    hashes.push(
      hash(
        compositor.render(
          project,
          index === 0 || index === 5
            ? emptyAudioSnapshot()
            : hotSnapshot(snapshot),
          times[index],
          30,
          false
        )
      )
    );
  }
  compositor.dispose();
  return hashes;
}

function statefulInstances(snapshot) {
  const project = projectFor("particleBurst");
  const source = project.layers.find(
    (layer) => layer.kind === "visualizer" && layer.pluginId === "particleBurst"
  );
  const duplicate = structuredClone(source);
  duplicate.id = "visualizer-particleBurst-independent";
  duplicate.opacity = 0.57;
  project.layers.push(duplicate);
  const compositor = new OfflineSceneCompositor(180, 320);
  let frame;
  for (let index = 0; index < 45; index += 1) {
    frame = compositor.render(
      project,
      index === 0 ? emptyAudioSnapshot() : hotSnapshot(snapshot),
      index / 30,
      30,
      false
    );
  }
  const result = hash(frame);
  compositor.dispose();
  return result;
}

const synthetic = syntheticSnapshot();
const real = realSnapshot();
const output = {
  format: 1,
  width: 180,
  height: 320,
  fps: 30,
  particleSeed: 305419896,
  audioFixtureSha256: hash(
    fs.readFileSync(
      path.join(root, "tests", "fixtures", "audio", "phase2-multiband.wav")
    )
  ),
  synthetic: Object.fromEntries(
    pluginIds.map((id) => [id, renderSequence(id, synthetic)])
  ),
  realAudio: Object.fromEntries(
    pluginIds.map((id) => [id, renderSequence(id, real)])
  ),
  previewOffline: previewOffline("spectrumBars", synthetic),
  seekForwardBackward: seekGolden(synthetic),
  twoStatefulInstances: statefulInstances(synthetic)
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
