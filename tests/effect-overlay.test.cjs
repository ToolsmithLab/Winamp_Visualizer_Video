"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createCanvas, ImageData } = require("@napi-rs/canvas");

const {
  createDefaultProject,
  normalizeProject
} = require("../dist/shared/project");
const {
  convertProjectMBgraToOverlayRgba,
  projectMOverlayAlpha
} = require("../dist/shared/projectMOverlay");
const {
  SceneCompositor
} = require("../dist/engine/composition/sceneCompositor");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(
  path.join(root, "src", "renderer", "app.ts"),
  "utf8"
);
const previewSource = fs.readFileSync(
  path.join(root, "src", "renderer", "previewRenderer.ts"),
  "utf8"
);
const nativeSource = fs.readFileSync(
  path.join(root, "native", "projectm-host", "src", "main.cpp"),
  "utf8"
);

function audio(value = 255) {
  return {
    volume: value / 255,
    bass: value / 255,
    mid: value / 255,
    high: value / 255,
    spectrum: new Uint8Array(128).fill(value),
    waveform: new Uint8Array(128).fill(value === 0 ? 128 : 220)
  };
}

function configuredProject(effectKind) {
  const project = createDefaultProject();
  project.canvas.width = 96;
  project.canvas.height = 96;
  project.cover.width = 1;
  project.cover.height = 1;
  project.cover.fitMode = "stretch";
  project.cover.cornerRadius = 0;
  project.text.title = "";
  project.text.artist = "";
  for (const layer of project.layers) layer.visible = false;
  const cover = project.layers.find((layer) => layer.kind === "cover");
  cover.visible = true;
  cover.opacity = 1;
  cover.transform = { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 };
  const effect = project.layers.find((layer) =>
    effectKind === "projectM"
      ? layer.kind === "projectM"
      : layer.kind === "visualizer" &&
        (layer.plugin?.id || layer.pluginId) === effectKind
  );
  effect.visible = true;
  effect.opacity = 1;
  effect.blendMode = "screen";
  effect.transform = { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 };
  effect.reactive ??= {
    band: "volume",
    sensitivity: 1,
    smoothing: 0,
    intensity: 1,
    color: "#22d3ee"
  };
  project.layers = [
    cover,
    effect,
    ...project.layers.filter(
      (layer) => layer !== cover && layer !== effect
    )
  ];
  return { project, cover, effect };
}

function renderScene(project, snapshot, projectM = null) {
  const canvas = createCanvas(96, 96);
  const context = canvas.getContext("2d");
  const cover = createCanvas(96, 96);
  const coverContext = cover.getContext("2d");
  coverContext.fillStyle = "#244060";
  coverContext.fillRect(0, 0, 96, 96);
  const visualizer = createCanvas(96, 96);
  const visualizerContext = visualizer.getContext("2d");
  const scene = new SceneCompositor();
  scene.render(
    context,
    96,
    96,
    project,
    snapshot,
    1,
    {
      cover,
      projectM,
      visualizer: { canvas: visualizer, context: visualizerContext }
    },
    { frameRate: 30 }
  );
  const pixels = context.getImageData(0, 0, 96, 96).data;
  scene.dispose();
  return pixels;
}

function pixel(data, x, y) {
  return [...data.slice((y * 96 + x) * 4, (y * 96 + x) * 4 + 4)];
}

test("overlay 01 - ordine semplice è cover, effetto, titolo, artista", () => {
  assert.match(
    appSource,
    /if \(layer\.kind === "cover"\) return 0;[\s\S]*visualizer" \|\| layer\.kind === "projectM"\) return 1;[\s\S]*titleText"\) return 2;[\s\S]*return 3/
  );
  assert.match(appSource, /applySimpleLayerOrder\(project\)/);
  assert.match(appSource, /layer\.kind === "projectM"\) layer\.blendMode = "screen"/);
});

test("overlay 02 - Canvas usa superficie alpha pulita e non copre la cover", () => {
  const { project, effect } = configuredProject("spectrumBars");
  effect.visible = false;
  const baseline = renderScene(project, audio());
  effect.visible = true;
  const rendered = renderScene(project, audio());
  assert.deepEqual(pixel(rendered, 4, 4), pixel(baseline, 4, 4));
  assert.notDeepEqual(pixel(rendered, 48, 72), pixel(baseline, 48, 72));
});

test("overlay 03 - clear alpha impedisce residui fra frame Canvas", () => {
  const { project } = configuredProject("spectrumBars");
  const canvas = createCanvas(96, 96);
  const context = canvas.getContext("2d");
  const cover = createCanvas(96, 96);
  cover.getContext("2d").fillRect(0, 0, 96, 96);
  const visualizer = createCanvas(96, 96);
  const visualizerContext = visualizer.getContext("2d");
  const scene = new SceneCompositor();
  const sources = {
    cover,
    projectM: null,
    visualizer: { canvas: visualizer, context: visualizerContext }
  };
  scene.render(context, 96, 96, project, audio(255), 1, sources, { frameRate: 30 });
  scene.render(context, 96, 96, project, audio(0), 2, sources, { frameRate: 30 });
  assert.equal(visualizerContext.getImageData(48, 70, 1, 1).data[3], 0);
  scene.dispose();
});

test("overlay 04 - luminance-to-alpha rende nero trasparente e luce visibile", () => {
  assert.equal(projectMOverlayAlpha(0, 0, 0), 0);
  assert.equal(projectMOverlayAlpha(4, 4, 4), 0);
  assert.ok(projectMOverlayAlpha(0, 180, 255) > 220);
  assert.equal(projectMOverlayAlpha(255, 255, 255), 255);
});

test("overlay 05 - conversione BGRA inizializza ogni pixel e rifiuta metadata errati", () => {
  const bytes = new Uint8Array(4 * 4 * 4);
  bytes.set([255, 180, 0, 255], 20);
  const reused = new Uint8ClampedArray(bytes.length).fill(255);
  const rgba = convertProjectMBgraToOverlayRgba(bytes, 4, 4, 16, reused);
  assert.equal(rgba, reused);
  assert.equal(rgba[3], 0);
  assert.ok(rgba[23] > 220);
  assert.throws(
    () => convertProjectMBgraToOverlayRgba(bytes, 4, 4, 20),
    /Framebuffer projectM non valido/
  );
});

test("overlay 06 - projectM nero lascia visibile la cover e la luce resta sopra", () => {
  const { project } = configuredProject("projectM");
  const baselineProject = structuredClone(project);
  baselineProject.layers.find((layer) => layer.kind === "projectM").visible = false;
  const baseline = renderScene(baselineProject, audio());
  const bytes = new Uint8Array(96 * 96 * 4);
  for (let y = 40; y < 56; y += 1) {
    for (let x = 40; x < 56; x += 1) {
      const offset = (y * 96 + x) * 4;
      bytes.set([255, 210, 20, 255], offset);
    }
  }
  const rgba = convertProjectMBgraToOverlayRgba(bytes, 96, 96, 384);
  const projectM = createCanvas(96, 96);
  projectM.getContext("2d").putImageData(new ImageData(rgba, 96, 96), 0, 0);
  const rendered = renderScene(project, audio(), projectM);
  assert.deepEqual(pixel(rendered, 4, 4), pixel(baseline, 4, 4));
  assert.notDeepEqual(pixel(rendered, 48, 48), pixel(baseline, 48, 48));
});

test("overlay 07 - trasformazioni effetto sono applicate nel compositor condiviso", () => {
  const { project, effect } = configuredProject("projectM");
  const bytes = new Uint8Array(96 * 96 * 4);
  for (let index = 0; index < bytes.length; index += 4) {
    bytes[index] = 255;
    bytes[index + 1] = 255;
    bytes[index + 2] = 255;
  }
  const rgba = convertProjectMBgraToOverlayRgba(bytes, 96, 96, 384);
  const projectM = createCanvas(96, 96);
  projectM.getContext("2d").putImageData(new ImageData(rgba, 96, 96), 0, 0);
  effect.transform = { x: 0.25, y: 0.5, scaleX: 0.25, scaleY: 0.25, rotation: 0 };
  const rendered = renderScene(project, audio(), projectM);
  const noEffect = structuredClone(project);
  noEffect.layers.find((layer) => layer.kind === "projectM").visible = false;
  const baseline = renderScene(noEffect, audio());
  assert.notDeepEqual(pixel(rendered, 24, 48), pixel(baseline, 24, 48));
  assert.deepEqual(pixel(rendered, 72, 48), pixel(baseline, 72, 48));
});

test("overlay 08 - projectM conserva intensità dopo normalize/save-reopen", () => {
  const { project, effect } = configuredProject("projectM");
  effect.reactive.intensity = 1.73;
  const restored = normalizeProject(JSON.parse(JSON.stringify(project)));
  const restoredEffect = restored.layers.find((layer) => layer.kind === "projectM");
  assert.equal(restoredEffect.reactive.intensity, 1.73);
});

test("overlay 09 - preview rende Canvas e projectM modificabili", () => {
  assert.match(previewSource, /layer\.kind === "visualizer"/);
  assert.match(previewSource, /layer\.kind === "projectM"/);
  assert.match(
    previewSource,
    /return \{ width: this\.canvas\.width \* 0\.84, height: this\.canvas\.height \* 0\.84 \}/
  );
  assert.match(previewSource, /effectPixelVisible/);
  assert.match(previewSource, /event\.shiftKey/);
});

test("overlay 10 - host nativo inizializza viewport, pack state e pixel", () => {
  assert.match(nativeSource, /glViewport\(0, 0/);
  assert.match(nativeSource, /glDisable\(GL_SCISSOR_TEST\)/);
  assert.match(nativeSource, /glPixelStorei\(GL_PACK_ALIGNMENT, 1\)/);
  assert.match(nativeSource, /glPixelStorei\(GL_PACK_ROW_LENGTH, 0\)/);
  assert.match(nativeSource, /pixels\.assign\(pixelBytes, 0\)/);
});

test("overlay 11 - combobox MilkDrop usa portal fixed e navigazione completa", () => {
  for (const token of [
    "simple-preset-button",
    "simple-preset-listbox",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Escape",
    "scrollIntoView",
    "positionSimplePresetListbox"
  ]) {
    assert.ok(appSource.includes(token), `Comportamento combobox mancante: ${token}`);
  }
});
