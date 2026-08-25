const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");

const {
  createDefaultProject,
  normalizeProject
} = require("../dist/shared/project");
const {
  coverDrawPlan,
  fittedCoverSize
} = require("../dist/engine/composition/coverLayout");
const {
  centerCover,
  fitCoverToCanvas,
  loadCoverIntoProject,
  removeCoverFromProject,
  resetCoverPresentation,
  setCoverVisible
} = require("../dist/engine/composition/coverCommands");
const {
  ProjectStore
} = require("../dist/engine/commands/projectStore");
const {
  OfflineSceneCompositor
} = require("../dist/main/export/offlineSceneCompositor");

const root = path.resolve(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "avs-cover-workflow-"));

test.after(async () => {
  await fsp.rm(tempRoot, { recursive: true, force: true });
});

function coverLayer(project) {
  return project.layers.find((layer) => layer.kind === "cover");
}

function close(actual, expected, epsilon = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

async function imageFixture(name, width, height, color) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, Math.max(1, width / 5), Math.max(1, height / 5));
  const filePath = path.join(tempRoot, name);
  await fsp.writeFile(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

function quietProject() {
  const project = createDefaultProject();
  project.projectM.enabled = false;
  for (const layer of project.layers) layer.visible = layer.kind === "cover";
  return project;
}

function snapshot() {
  return {
    volume: 0.6,
    bass: 0.7,
    mid: 0.4,
    high: 0.3,
    spectrum: new Uint8Array(128).fill(150),
    waveform: new Uint8Array(128).fill(128)
  };
}

test("cover 01 - default Contieni e layer Cover nel flusso principale", () => {
  const project = createDefaultProject();
  assert.equal(project.cover.fitMode, "contain");
  assert.equal(coverLayer(project).name, "Cover");
});

test("cover 02 - caricamento quadrato adatta e rende visibile", () => {
  const project = quietProject();
  loadCoverIntoProject(project, "square.png", { width: 1000, height: 1000 });
  assert.equal(project.cover.filePath, "square.png");
  assert.equal(coverLayer(project).visible, true);
  close(
    project.cover.width * project.canvas.width,
    project.cover.height * project.canvas.height
  );
});

test("cover 03 - caricamento verticale 9:16 preserva il rapporto", () => {
  const size = fittedCoverSize(900, 1600, 1080, 1920);
  close((size.width * 1080) / (size.height * 1920), 9 / 16);
  assert.ok(size.height <= 1);
});

test("cover 04 - caricamento orizzontale 16:9 preserva il rapporto", () => {
  const size = fittedCoverSize(1600, 900, 1080, 1920);
  close((size.width * 1080) / (size.height * 1920), 16 / 9);
  assert.ok(size.width <= 1);
});

test("cover 04b - cover con rapporto uguale riempie esattamente i quattro stage", () => {
  for (const [imageWidth, imageHeight, stageWidth, stageHeight] of [
    [900, 1600, 1080, 1920],
    [1000, 1000, 1080, 1080],
    [1600, 1200, 1440, 1080],
    [1600, 900, 1920, 1080]
  ]) {
    const size = fittedCoverSize(
      imageWidth,
      imageHeight,
      stageWidth,
      stageHeight,
      1,
      1
    );
    close(size.width, 1);
    close(size.height, 1);
  }
});

test("cover 05 - Contieni mostra tutta l'immagine senza crop", () => {
  const plan = coverDrawPlan(1600, 900, 400, 400, "contain");
  assert.deepEqual(
    [plan.sourceX, plan.sourceY, plan.sourceWidth, plan.sourceHeight],
    [0, 0, 1600, 900]
  );
  assert.equal(plan.destinationWidth, 400);
  assert.ok(plan.destinationHeight < 400);
});

test("cover 06 - Riempi conserva proporzioni e usa crop centrato", () => {
  const plan = coverDrawPlan(1600, 900, 400, 400, "fill");
  assert.equal(plan.destinationWidth, 400);
  assert.equal(plan.destinationHeight, 400);
  assert.ok(plan.sourceWidth < 1600);
  assert.ok(plan.sourceX > 0);
});

test("cover 07 - Stira riempie tutta l'area senza crop", () => {
  const plan = coverDrawPlan(1600, 900, 400, 300, "stretch");
  assert.equal(plan.sourceWidth, 1600);
  assert.equal(plan.sourceHeight, 900);
  assert.equal(plan.destinationWidth, 400);
  assert.equal(plan.destinationHeight, 300);
});

test("cover 08 - Originale non supera dimensioni intrinseche normalizzate", () => {
  const plan = coverDrawPlan(200, 100, 500, 500, "original", 0.5);
  assert.equal(plan.destinationWidth, 100);
  assert.equal(plan.destinationHeight, 50);
});

test("cover 09 - Centra modifica posizione e rimuove keyframe X/Y", () => {
  const project = quietProject();
  const layer = coverLayer(project);
  layer.transform.x = 0.12;
  layer.transform.y = 0.88;
  layer.keyframes = [
    { id: "x", property: "x", time: 1, value: 0.2, interpolation: "linear" },
    { id: "r", property: "rotation", time: 1, value: 20, interpolation: "linear" }
  ];
  centerCover(project);
  assert.equal(layer.transform.x, 0.5);
  assert.equal(layer.transform.y, 0.5);
  assert.deepEqual(layer.keyframes.map((item) => item.property), ["rotation"]);
});

test("cover 10 - Adatta azzera la scala ma conserva posizione e rotazione", () => {
  const project = quietProject();
  const layer = coverLayer(project);
  layer.transform = { x: 0.2, y: 0.7, scaleX: 3, scaleY: 2, rotation: 27 };
  fitCoverToCanvas(project, { width: 1600, height: 900 });
  assert.deepEqual(layer.transform, {
    x: 0.2,
    y: 0.7,
    scaleX: 1,
    scaleY: 1,
    rotation: 27
  });
});

test("cover 11 - Ripristina posa, opacità, blend e adattamento", () => {
  const project = quietProject();
  const layer = coverLayer(project);
  project.cover.fitMode = "stretch";
  project.cover.opacity = 0.2;
  layer.opacity = 0.3;
  layer.blendMode = "multiply";
  layer.transform = { x: 0.1, y: 0.9, scaleX: 2, scaleY: 3, rotation: 50 };
  resetCoverPresentation(project, { width: 1000, height: 1000 });
  assert.equal(project.cover.fitMode, "contain");
  assert.equal(project.cover.opacity, 1);
  assert.equal(layer.opacity, 1);
  assert.equal(layer.blendMode, "source-over");
  assert.deepEqual(layer.transform, {
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0
  });
});

test("cover 12 - Mostra cover on/off non rimuove il file", () => {
  const project = quietProject();
  project.cover.filePath = "cover.png";
  setCoverVisible(project, false);
  assert.equal(coverLayer(project).visible, false);
  assert.equal(project.cover.filePath, "cover.png");
  setCoverVisible(project, true);
  assert.equal(coverLayer(project).visible, true);
});

test("cover 13 - Rimuovi elimina riferimento e asset ma conserva il layer", () => {
  const project = quietProject();
  project.cover.filePath = "cover.png";
  project.assets.push({
    id: "cover-main",
    type: "cover",
    path: "cover.png",
    originalPath: "cover.png",
    relativePath: "cover.png",
    fileName: "cover.png",
    size: 100,
    hash: "a",
    status: "available",
    required: false
  });
  removeCoverFromProject(project);
  assert.equal(project.cover.filePath, null);
  assert.equal(coverLayer(project).visible, false);
  assert.equal(project.assets.some((asset) => asset.type === "cover"), false);
});

test("cover 14 - undo/redo ripristina caricamento e rimozione", () => {
  const store = new ProjectStore(quietProject());
  store.update(
    (project) =>
      loadCoverIntoProject(project, "cover.png", { width: 1000, height: 1000 }),
    "Carica cover"
  );
  store.update(removeCoverFromProject, "Rimuovi cover");
  assert.equal(store.project.cover.filePath, null);
  assert.equal(store.undo(), true);
  assert.equal(store.project.cover.filePath, "cover.png");
  assert.equal(store.redo(), true);
  assert.equal(store.project.cover.filePath, null);
});

test("cover 15 - save/reopen conserva adattamento e trasformazione", () => {
  const project = quietProject();
  project.cover.filePath = "D:\\Media\\cover.png";
  project.cover.fitMode = "fill";
  coverLayer(project).transform = {
    x: 0.33,
    y: 0.44,
    scaleX: 1.2,
    scaleY: 0.8,
    rotation: 17
  };
  const restored = normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.cover.fitMode, "fill");
  assert.deepEqual(coverLayer(restored).transform, coverLayer(project).transform);
});

test("cover 16 - progetto precedente senza fitMode migra a Contieni", () => {
  const project = createDefaultProject();
  delete project.cover.fitMode;
  const restored = normalizeProject(project);
  assert.equal(restored.cover.fitMode, "contain");
});

test("cover 17 - export offline contiene la cover quadrata", async () => {
  const filePath = await imageFixture("square.png", 120, 120, "#e11d48");
  const project = quietProject();
  loadCoverIntoProject(project, filePath, { width: 120, height: 120 });
  const compositor = new OfflineSceneCompositor(180, 320);
  await compositor.loadCover(filePath);
  const frame = compositor.render(project, snapshot(), 0, 30, false);
  assert.ok(frame.some((value) => value > 180));
  compositor.dispose();
});

test("cover 18 - export carica correttamente cover 9:16", async () => {
  const filePath = await imageFixture("vertical.png", 90, 160, "#16a34a");
  const project = quietProject();
  loadCoverIntoProject(project, filePath, { width: 90, height: 160 });
  const compositor = new OfflineSceneCompositor(180, 320);
  await compositor.loadCover(filePath);
  assert.equal(compositor.render(project, snapshot(), 0, 30, false).length, 180 * 320 * 4);
  compositor.dispose();
});

test("cover 19 - export carica correttamente cover 16:9", async () => {
  const filePath = await imageFixture("horizontal.png", 160, 90, "#2563eb");
  const project = quietProject();
  loadCoverIntoProject(project, filePath, { width: 160, height: 90 });
  const compositor = new OfflineSceneCompositor(180, 320);
  await compositor.loadCover(filePath);
  assert.equal(compositor.render(project, snapshot(), 0, 30, false).length, 180 * 320 * 4);
  compositor.dispose();
});

test("cover 20 - cover ed effetto convivono nello stesso compositor", async () => {
  const filePath = await imageFixture("combined.png", 100, 100, "#7c3aed");
  const project = quietProject();
  loadCoverIntoProject(project, filePath, { width: 100, height: 100 });
  const effect = project.layers.find(
    (layer) => layer.kind === "visualizer" && layer.pluginId === "spectrumBars"
  );
  effect.visible = true;
  const compositor = new OfflineSceneCompositor(180, 320);
  await compositor.loadCover(filePath);
  const combined = Buffer.from(compositor.render(project, snapshot(), 0, 30, false));
  effect.visible = false;
  compositor.reset();
  const coverOnly = Buffer.from(compositor.render(project, snapshot(), 0, 30, false));
  assert.notDeepEqual(combined, coverOnly);
  compositor.dispose();
});

test("cover 21 - ordine layer cover/effetto cambia il frame composto", async () => {
  const filePath = await imageFixture("ordering.png", 100, 100, "#f97316");
  const project = quietProject();
  loadCoverIntoProject(project, filePath, { width: 100, height: 100 });
  project.cover.fitMode = "stretch";
  project.cover.width = 1;
  project.cover.height = 1;
  coverLayer(project).transform.y = 0.5;
  const effect = project.layers.find(
    (layer) => layer.kind === "visualizer" && layer.pluginId === "spectrumBars"
  );
  effect.visible = true;
  effect.blendMode = "source-over";
  const compositor = new OfflineSceneCompositor(180, 320);
  await compositor.loadCover(filePath);
  project.layers = [effect, coverLayer(project)];
  const coverAbove = Buffer.from(compositor.render(project, snapshot(), 0, 30, false));
  compositor.reset();
  project.layers = [coverLayer(project), effect];
  const effectAbove = Buffer.from(compositor.render(project, snapshot(), 0, 30, false));
  assert.notDeepEqual(coverAbove, effectAbove);
  compositor.dispose();
});

test("cover 22 - UI primaria espone tutti i comandi e seleziona dopo il load", () => {
  const source = fs.readFileSync(path.join(root, "src", "renderer", "app.ts"), "utf8");
  for (const label of [
    "Carica cover",
    "Mostra cover",
    "Adattamento cover",
    "Contieni",
    "Riempi",
    "Stira",
    "Originale",
    "Adatta",
    "Centra",
    "Ripristina",
    "Rimuovi"
  ]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /loadCoverIntoProject\(project, selection\.path, image\)/);
  assert.match(source, /selectLayer\(backgroundLayer\(\)\?\.id \?\? "cover"\)/);
});

test("cover 23 - canvas espone drag, resize, rotazione, Shift ed Escape", () => {
  const source = fs.readFileSync(
    path.join(root, "src", "renderer", "previewRenderer.ts"),
    "utf8"
  );
  assert.match(source, /"move"/);
  assert.match(source, /"resize"/);
  assert.match(source, /"rotate"/);
  assert.match(source, /event\.shiftKey/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /releasePointerCapture/);
});

test("cover 24 - empty state segue il nuovo flusso semplice", () => {
  const source = fs.readFileSync(path.join(root, "src", "renderer", "app.ts"), "utf8");
  assert.match(source, /1\. Carica una cover o una clip video/);
  assert.match(source, /2\. Carica il brano/);
  assert.match(source, /3\. Scrivi titolo e artista/);
  assert.match(source, /4\. Scegli un effetto/);
  assert.match(source, /5\. Premi Play/);
  assert.match(source, /Scegli un effetto e premi Play/);
});
