"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const {
  PROJECT_VERSION,
  createDefaultProject,
  normalizeProject
} = require("../dist/shared/project");
const {
  assertFreeOutputSpace,
  requiredOutputSpaceBytes,
  startExport
} = require("../dist/main/exportService");
const {
  OfflineSceneCompositor
} = require("../dist/main/export/offlineSceneCompositor");
const { analyzePcm } = require("../dist/shared/audioAnalysis");

function visualizer(project, pluginId) {
  return project.layers.find(
    (layer) => layer.kind === "visualizer" && layer.pluginId === pluginId
  );
}

test("il progetto predefinito usa lo schema corrente", () => {
  const project = createDefaultProject();
  assert.equal(project.version, PROJECT_VERSION);
  assert.equal(project.version, "6.0");
});

test("il progetto predefinito contiene projectM e sei overlay visualizzatori", () => {
  const project = createDefaultProject();
  assert.equal(project.layers.length, 10);
  assert.equal(
    project.layers.filter((layer) => layer.kind === "projectM").length,
    1
  );
  assert.equal(
    project.layers.filter((layer) => layer.kind === "visualizer").length,
    6
  );
});

test("un progetto 1.0 viene migrato senza perdere i dati principali", () => {
  const project = normalizeProject({
    version: "1.0",
    name: "Legacy",
    audioFile: "C:\\media\\song.wav",
    text: { artist: "Autore", title: "Titolo", color: "#ffffff" }
  });
  assert.equal(project.version, "6.0");
  assert.equal(project.name, "Legacy");
  assert.equal(project.audioFile, "C:\\media\\song.wav");
  assert.equal(project.text.artist, "Autore");
  assert.equal(project.layers.length, 10);
  assert.equal(project.projectM.enabled, true);
});

test("la normalizzazione preserva le impostazioni reattive salvate", () => {
  const original = createDefaultProject();
  const bars = visualizer(original, "spectrumBars");
  bars.reactive.sensitivity = 2.25;
  bars.reactive.band = "high";
  const restored = normalizeProject(JSON.parse(JSON.stringify(original)));
  const restoredBars = visualizer(restored, "spectrumBars");
  assert.equal(restoredBars.reactive.sensitivity, 2.25);
  assert.equal(restoredBars.reactive.band, "high");
});

test("il round trip JSON mantiene ordine e visibilità dei livelli", () => {
  const original = createDefaultProject();
  original.layers.reverse();
  original.layers[0].visible = false;
  const restored = normalizeProject(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(
    restored.layers.map(({ id, visible }) => ({ id, visible })),
    original.layers.map(({ id, visible }) => ({ id, visible }))
  );
});

test("l'export non contiene sostituti visuali FFmpeg", () => {
  const source = readFileSync("src/main/exportService.ts", "utf8");
  assert.doesNotMatch(
    source,
    /showfreqs|showwaves|drawtext|filter_complex|colorchannelmixer/
  );
  assert.match(source, /rawvideo/);
  assert.match(source, /rgba/);
});

test("il compositor offline renderizza tre overlay Canvas attivi", () => {
  const project = createDefaultProject();
  project.projectM.enabled = false;
  project.text.artist = "Artista";
  project.text.title = "Titolo";
  for (const layer of project.layers) {
    if (layer.kind === "visualizer") {
      layer.visible = [
        "spectrumBars",
        "circularSpectrum",
        "waveformLine"
      ].includes(layer.pluginId);
    }
  }
  const pcm = new Float32Array(1600 * 2);
  for (let frame = 0; frame < 1600; frame += 1) {
    pcm[frame * 2] = Math.sin((2 * Math.PI * 220 * frame) / 48000) * 0.8;
    pcm[frame * 2 + 1] = pcm[frame * 2];
  }
  const snapshot = analyzePcm(pcm, 2, 48000);
  const compositor = new OfflineSceneCompositor(180, 320);
  const frame = compositor.render(project, snapshot, 1, 30, false);
  assert.equal(frame.byteLength, 180 * 320 * 4);
  assert.ok(frame.some((value) => value > 16));
  compositor.dispose();
});

test("seed, timestamp e PCM identici producono frame Canvas identici", () => {
  const project = createDefaultProject();
  project.projectM.enabled = false;
  for (const layer of project.layers) {
    if (layer.kind === "visualizer") {
      layer.visible = layer.pluginId === "particleBurst";
    }
  }
  const pcm = new Float32Array(1600 * 2).fill(0.9);
  const snapshot = analyzePcm(pcm, 2, 48000);
  const first = new OfflineSceneCompositor(180, 320);
  const second = new OfflineSceneCompositor(180, 320);
  let frameA;
  let frameB;
  for (let index = 0; index < 30; index += 1) {
    frameA = first.render(project, snapshot, index / 30, 30, false);
    frameB = second.render(project, snapshot, index / 30, 30, false);
  }
  assert.deepEqual(frameA, frameB);
  first.dispose();
  second.dispose();
});

test("intervalli, visibilità e ordine livelli modificano il frame", () => {
  const project = createDefaultProject();
  project.projectM.enabled = false;
  const bars = visualizer(project, "spectrumBars");
  bars.visible = true;
  bars.startTime = 1;
  bars.endTime = 3;
  const snapshot = analyzePcm(new Float32Array(2048).fill(0.7), 2, 48000);
  const compositor = new OfflineSceneCompositor(180, 320);
  const before = Buffer.from(
    compositor.render(project, snapshot, 0, 30, false)
  );
  const active = Buffer.from(
    compositor.render(project, snapshot, 2, 30, false)
  );
  assert.notDeepEqual(before, active);
  project.layers.reverse();
  const reordered = compositor.render(
    project,
    snapshot,
    2 + 1 / 30,
    30,
    false
  );
  assert.notDeepEqual(active, reordered);
  compositor.dispose();
});

test("i sette blend mode UI sono supportati dal compositor offline", () => {
  const project = createDefaultProject();
  project.projectM.enabled = false;
  const layer = visualizer(project, "spectrumBars");
  layer.visible = true;
  const compositor = new OfflineSceneCompositor(180, 320);
  const snapshot = analyzePcm(new Float32Array(2048).fill(0.5), 2, 48000);
  for (const blendMode of [
    "source-over",
    "screen",
    "lighter",
    "multiply",
    "overlay",
    "lighten",
    "darken"
  ]) {
    layer.blendMode = blendMode;
    assert.doesNotThrow(() =>
      compositor.render(project, snapshot, 1, 30, false)
    );
  }
  compositor.dispose();
});

test("l'export senza file audio viene rifiutato con errore comprensibile", async () => {
  const project = createDefaultProject();
  await assert.rejects(
    () => startExport({ isDestroyed: () => false }, project, "output.mp4"),
    /Seleziona un file audio/
  );
});

test("spazio disco insufficiente è rifiutato prima dell'encoder", () => {
  const project = createDefaultProject();
  const required = requiredOutputSpaceBytes(project, 12_000_000);
  assert.ok(required >= 512 * 1024 * 1024);
  assert.throws(
    () => assertFreeOutputSpace(required - 1, required),
    /Spazio su disco insufficiente/
  );
  assert.doesNotThrow(() => assertFreeOutputSpace(required, required));
});

test("annullamento ed errori eliminano sempre l'output parziale", () => {
  const source = readFileSync("src/main/exportService.ts", "utf8");
  assert.match(source, /cancelExport[\s\S]*removePartialOutput/);
  assert.match(
    source,
    /job\.completion\s*=\s*\(async[\s\S]*finally[\s\S]*!completed[\s\S]*removePartialOutput/
  );
  assert.match(source, /rm\(destination,\s*\{\s*force:\s*true\s*\}\)/);
});
