"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createCanvas } = require("@napi-rs/canvas");
const {
  assertOpaqueFrameCoverage,
  inspectRgbaFrameCoverage,
  resolveFittedSurface,
  resolveFrameTarget,
  resolveFullFrameSurface
} = require("../dist/engine/composition/frameLayout");
const {
  SceneCompositor
} = require("../dist/engine/composition/sceneCompositor");
const {
  createDefaultProject
} = require("../dist/shared/project");

const snapshot = {
  volume: 0.4,
  bass: 0.3,
  mid: 0.2,
  high: 0.1,
  waveform: new Float32Array(128),
  spectrum: new Float32Array(64)
};

function onlyProjectMLayer(project) {
  for (const layer of project.layers) {
    layer.visible = layer.kind === "projectM";
  }
  project.projectM.enabled = true;
  return project.layers.find((layer) => layer.kind === "projectM");
}

function render(project, width, height, projectM, cover = null) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  const compositor = new SceneCompositor();
  try {
    compositor.render(
      context,
      width,
      height,
      project,
      snapshot,
      0,
      { projectM, cover },
      { frameRate: 30 }
    );
    return canvas.data();
  } finally {
    compositor.dispose();
  }
}

test("banda export 01 - target, viewport, scissor, stride e byte coprono quattro rapporti", () => {
  for (const [width, height] of [
    [270, 480],
    [360, 360],
    [480, 360],
    [480, 270]
  ]) {
    const target = resolveFrameTarget(width, height);
    assert.deepEqual(target.viewport, {
      x: 0,
      y: 0,
      width,
      height,
      right: width,
      bottom: height
    });
    assert.deepEqual(target.scissor, target.viewport);
    assert.equal(target.stride, width * 4);
    assert.equal(target.byteLength, width * height * 4);
  }
});

test("banda export 02 - resolver condiviso applica fill senza lasciare spazio", () => {
  const layout = resolveFittedSurface(1920, 1080, 720, 1280, "fill");
  assert.equal(layout.destination.x, -360);
  assert.equal(layout.destination.y, -640);
  assert.equal(layout.destination.width, 720);
  assert.equal(layout.destination.height, 1280);
  assert.equal(layout.source.height, 1080);
  assert.equal(layout.source.width, 607.5);
});

test("banda export 03 - projectM usa crop edge e destinazione full-frame", () => {
  const layout = resolveFullFrameSurface(720, 1280, 720, 1280, 1);
  assert.deepEqual(layout.source, {
    x: 1,
    y: 1,
    width: 718,
    height: 1278,
    right: 719,
    bottom: 1279
  });
  assert.deepEqual(layout.destination, {
    x: 0,
    y: 0,
    width: 720,
    height: 1280,
    right: 720,
    bottom: 1280
  });
});

test("banda export 04 - controllo pixel rifiuta ultima riga non inizializzata", () => {
  const bytes = new Uint8Array(8 * 8 * 4);
  for (let offset = 3; offset < bytes.byteLength - 8 * 4; offset += 4) {
    bytes[offset] = 255;
  }
  const coverage = inspectRgbaFrameCoverage(bytes, 8, 8);
  assert.equal(coverage.writtenRows, 7);
  assert.equal(coverage.lastRowWritten, false);
  assert.equal(coverage.lastTenRowsWritten, false);
  assert.throws(
    () => assertOpaqueFrameCoverage(bytes, 8, 8),
    /non completamente inizializzato/
  );
});

test("banda export 05 - compositor inizializza prima, ultima e ultime dieci righe", () => {
  const project = createDefaultProject();
  onlyProjectMLayer(project);
  const projectM = createCanvas(48, 64);
  const bytes = render(project, 48, 64, projectM);
  const coverage = assertOpaqueFrameCoverage(bytes, 48, 64);
  assert.equal(coverage.writtenRows, 64);
  assert.equal(coverage.firstRowWritten, true);
  assert.equal(coverage.lastRowWritten, true);
  assert.equal(coverage.lastTenRowsWritten, true);
  assert.equal(coverage.byteLength, 48 * 64 * 4);
});

test("banda export 06 - crop projectM non usa la scanline inferiore nera", () => {
  const project = createDefaultProject();
  const layer = onlyProjectMLayer(project);
  layer.blendMode = "source-over";
  const projectM = createCanvas(8, 8);
  const source = projectM.getContext("2d");
  source.fillStyle = "#ef233c";
  source.fillRect(0, 0, 8, 7);
  source.fillStyle = "#000000";
  source.fillRect(0, 7, 8, 1);
  const bytes = render(project, 16, 16, projectM);
  const lastRowOffset = 15 * 16 * 4;
  for (let x = 0; x < 16; x += 1) {
    const offset = lastRowOffset + x * 4;
    assert.ok(bytes[offset] > 100 || bytes[offset + 2] > 100);
    assert.equal(bytes[offset + 3], 255);
  }
});

test("banda export 07 - effetto ridimensionato lascia comunque target opaco", () => {
  const project = createDefaultProject();
  const layer = onlyProjectMLayer(project);
  layer.transform = {
    x: 0.48,
    y: 0.42,
    scaleX: 0.72,
    scaleY: 0.68,
    rotation: 7
  };
  const projectM = createCanvas(48, 64);
  const source = projectM.getContext("2d");
  source.fillStyle = "#22c55e";
  source.fillRect(0, 0, 48, 64);
  const bytes = render(project, 48, 64, projectM);
  const coverage = assertOpaqueFrameCoverage(bytes, 48, 64);
  assert.equal(coverage.invalidAlphaPixels, 0);
  assert.equal(coverage.lastRowWritten, true);
});

test("banda export 08 - cambio formato conserva buffer esatto e ultima riga", () => {
  const project = createDefaultProject();
  onlyProjectMLayer(project);
  for (const [width, height] of [
    [54, 96],
    [72, 72],
    [96, 72],
    [96, 54]
  ]) {
    const projectM = createCanvas(width, height);
    const source = projectM.getContext("2d");
    source.fillStyle = "#38bdf8";
    source.fillRect(0, 0, width, height);
    const bytes = render(project, width, height, projectM);
    const coverage = assertOpaqueFrameCoverage(bytes, width, height);
    assert.equal(bytes.byteLength, width * height * 4);
    assert.equal(coverage.writtenRows, height);
    assert.equal(coverage.lastRowWritten, true);
  }
});
