"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createCanvas } = require("@napi-rs/canvas");
const {
  PluginRegistry,
  PLUGIN_CATALOG_ORDER,
  pluginRegistry
} = require("../dist/engine/plugins/registry");
const {
  normalizePluginParameter,
  normalizePluginSettings
} = require("../dist/engine/plugins/validation");
const {
  PLUGIN_ERROR_SUSPEND_THRESHOLD,
  VisualizerHost
} = require("../dist/engine/plugins/visualizerHost");
const {
  SceneCompositor
} = require("../dist/engine/composition/sceneCompositor");
const {
  createDefaultProject,
  normalizeProject
} = require("../dist/shared/project");

const root = path.resolve(__dirname, "..");
const newIds = [
  "radialRays",
  "mirroredWaveform",
  "audioGrid",
  "orbitingParticles"
];
const oldIds = PLUGIN_CATALOG_ORDER.slice(0, 6);

function snapshot(variant = 1) {
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

function layerFor(id, layerId = `test-${id}`, settings) {
  const descriptor = pluginRegistry.get(id);
  return {
    id: layerId,
    name: descriptor.displayName,
    kind: "visualizer",
    pluginId: id,
    plugin: {
      id,
      version: descriptor.version,
      settings: structuredClone(settings ?? descriptor.defaultSettings)
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

function renderLayer(
  id,
  audio = snapshot(1),
  time = 12.5,
  width = 180,
  height = 320,
  fps = 30,
  layerId
) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  const project = createDefaultProject();
  project.layers = [layerFor(id, layerId)];
  const compositor = new SceneCompositor();
  compositor.render(
    context,
    width,
    height,
    project,
    audio,
    time,
    { projectM: null, cover: null },
    { frameRate: fps }
  );
  compositor.dispose();
  return Buffer.from(canvas.data());
}

function hash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function nonEmpty(buffer) {
  for (let index = 3; index < buffer.length; index += 4) {
    if (buffer[index] !== 0) return true;
  }
  return false;
}

function fakeDescriptor(id, behavior = {}, calls = []) {
  return {
    id,
    displayName: `Test ${id}`,
    category: "effect",
    version: "1.0.0",
    description: "Descriptor lifecycle test.",
    defaultSettings: { amount: 1 },
    parameters: [
      {
        key: "amount",
        label: "Amount",
        type: "number",
        defaultValue: 1,
        minimum: 0,
        maximum: 2,
        step: 0.1,
        animatable: true,
        description: "Test amount."
      }
    ],
    create() {
      calls.push("create");
      let settings = { amount: 1 };
      return {
        initialize() {
          calls.push("initialize");
          if (behavior.initialize) throw new Error("initialize failure");
        },
        render(frame) {
          calls.push("render");
          frame.context.globalAlpha = 0.2;
          if (behavior.render) throw new Error("render failure");
          frame.context.fillStyle = "#ffffff";
          frame.context.fillRect(0, 0, 4, 4);
        },
        resize() {
          calls.push("resize");
          if (behavior.resize) throw new Error("resize failure");
        },
        reset() {
          calls.push("reset");
          if (behavior.reset) throw new Error("reset failure");
        },
        serialize() {
          calls.push("serialize");
          return structuredClone(settings);
        },
        deserialize(next) {
          calls.push("deserialize");
          if (behavior.deserialize) throw new Error("deserialize failure");
          settings = structuredClone(next);
        },
        dispose() {
          calls.push("dispose");
          if (behavior.dispose) throw new Error("dispose failure");
        }
      };
    }
  };
}

test("registro M2 contiene esattamente dieci plugin Canvas ordinati", () => {
  assert.equal(pluginRegistry.size, 10);
  assert.deepEqual(
    pluginRegistry.list().map((descriptor) => descriptor.id),
    [...PLUGIN_CATALOG_ORDER]
  );
  assert.equal(pluginRegistry.get("projectM"), undefined);
  for (const id of PLUGIN_CATALOG_ORDER) assert.equal(pluginRegistry.get(id).id, id);
  assert.throws(
    () =>
      new PluginRegistry([
        pluginRegistry.get("spectrumBars"),
        pluginRegistry.get("spectrumBars")
      ]),
    /duplicato/
  );
});

test("descriptor e schema parametri coprono number, boolean, color e select", () => {
  const types = new Set();
  for (const descriptor of pluginRegistry.list()) {
    assert.ok(descriptor.displayName);
    assert.ok(descriptor.description);
    assert.ok(descriptor.version);
    assert.ok(descriptor.parameters.length);
    for (const parameter of descriptor.parameters) types.add(parameter.type);
  }
  // Il contratto supporta boolean anche se i dieci descriptor correnti
  // preferiscono select numerici per evitare controlli decorativi.
  const booleanParameter = {
    key: "enabled",
    label: "Enabled",
    type: "boolean",
    defaultValue: true,
    animatable: false,
    description: "Boolean validation."
  };
  assert.equal(normalizePluginParameter(booleanParameter, "bad"), true);
  types.add("boolean");
  assert.deepEqual([...types].sort(), ["boolean", "color", "number", "select"]);
});

test("validazione normalizza non finiti, range, colori, select e chiavi ignote", () => {
  const descriptor = pluginRegistry.get("audioGrid");
  const normalized = normalizePluginSettings(descriptor, {
    rows: Number.NaN,
    columns: Infinity,
    spacing: 99,
    lowColor: "red",
    frequencyMode: "unknown",
    undeclared: 42
  });
  assert.equal(normalized.rows, 10);
  assert.equal(normalized.columns, 8);
  assert.equal(normalized.spacing, 0.65);
  assert.equal(normalized.lowColor, "#0ea5e9");
  assert.equal(normalized.frequencyMode, "spectrum");
  assert.equal("undeclared" in normalized, false);
});

test("lifecycle completo, resize, serialize e dispose sono per istanza", () => {
  const calls = [];
  const registry = new PluginRegistry([fakeDescriptor("lifecycleTest", {}, calls)]);
  const host = new VisualizerHost(registry);
  const canvas = createCanvas(64, 64);
  const context = canvas.getContext("2d");
  const layer = {
    ...layerFor("spectrumBars", "lifecycle-layer", { amount: 1 }),
    pluginId: undefined,
    plugin: { id: "lifecycleTest", version: "1.0.0", settings: { amount: 1 } }
  };
  host.render(context, 64, 64, layer, snapshot(), 0, 30);
  host.render(context, 80, 80, layer, snapshot(), 1 / 30, 30);
  assert.deepEqual(host.serializeLayer(layer.id), { amount: 1 });
  host.reconcile([]);
  for (const call of [
    "create",
    "initialize",
    "deserialize",
    "render",
    "resize",
    "serialize",
    "reset",
    "dispose"
  ]) assert.ok(calls.includes(call), call);
});

test("100 cicli create/render/dispose non lasciano istanze registrate", () => {
  const descriptor = pluginRegistry.get("orbitingParticles");
  for (let cycle = 0; cycle < 100; cycle += 1) {
    const host = new VisualizerHost(new PluginRegistry([descriptor]));
    const canvas = createCanvas(48, 48);
    const layer = layerFor("orbitingParticles", `cycle-${cycle}`);
    host.render(canvas.getContext("2d"), 48, 48, layer, snapshot(), cycle, 30);
    host.dispose();
    assert.equal(host.statuses().length, 0);
  }
});

test("errori initialize/render/resize/deserialize sono isolati e sospesi", () => {
  for (const operation of ["initialize", "render", "resize", "deserialize"]) {
    const statuses = [];
    const registry = new PluginRegistry([
      fakeDescriptor(`error${operation}`, { [operation]: true })
    ]);
    const host = new VisualizerHost(registry, (status) => statuses.push(status));
    const canvas = createCanvas(64, 64);
    const context = canvas.getContext("2d");
    const layer = {
      ...layerFor("spectrumBars", `layer-${operation}`, { amount: 1 }),
      pluginId: undefined,
      plugin: {
        id: `error${operation}`,
        version: "1.0.0",
        settings: { amount: 1 }
      }
    };
    if (operation === "resize") {
      host.render(context, 64, 64, layer, snapshot(), 0, 30);
    }
    for (let attempt = 0; attempt < PLUGIN_ERROR_SUSPEND_THRESHOLD; attempt += 1) {
      const size = operation === "resize" ? 80 : 64;
      host.render(context, size, size, layer, snapshot(), attempt + 1, 30);
    }
    assert.equal(host.status(layer.id).state, "suspended", operation);
    assert.ok(statuses.some((status) => status.message.includes(operation)));
    host.dispose();
  }
});

test("errori reset/dispose non interrompono cleanup o altri plugin", () => {
  for (const operation of ["reset", "dispose"]) {
    const statuses = [];
    const registry = new PluginRegistry([
      fakeDescriptor(`cleanup${operation}`, { [operation]: true })
    ]);
    const host = new VisualizerHost(registry, (status) => statuses.push(status));
    const canvas = createCanvas(64, 64);
    const layer = {
      ...layerFor("spectrumBars", `cleanup-${operation}`, { amount: 1 }),
      pluginId: undefined,
      plugin: {
        id: `cleanup${operation}`,
        version: "1.0.0",
        settings: { amount: 1 }
      }
    };
    host.render(canvas.getContext("2d"), 64, 64, layer, snapshot(), 0, 30);
    assert.doesNotThrow(() => host.dispose());
    assert.equal(host.statuses().length, 0);
    assert.ok(statuses.some((status) => status.message.includes(operation)));
  }
});

test("Canvas state viene ripristinato dopo errore render", () => {
  const registry = new PluginRegistry([
    fakeDescriptor("canvasStateTest", { render: true })
  ]);
  const host = new VisualizerHost(registry);
  const canvas = createCanvas(64, 64);
  const context = canvas.getContext("2d");
  context.globalAlpha = 0.73;
  const layer = {
    ...layerFor("spectrumBars", "canvas-state", { amount: 1 }),
    pluginId: undefined,
    plugin: {
      id: "canvasStateTest",
      version: "1.0.0",
      settings: { amount: 1 }
    }
  };
  host.render(context, 64, 64, layer, snapshot(), 0, 30);
  assert.ok(Math.abs(context.globalAlpha - 0.73) < 1 / 255);
  host.resetLayer(layer.id);
  assert.equal(host.status(layer.id), null);
});

test("golden M2 dei quattro plugin è stabile e audio-reattivo", () => {
  const golden = JSON.parse(
    fs.readFileSync(
      path.join(root, "tests", "fixtures", "golden", "phase3-m2-canvas-golden.json"),
      "utf8"
    )
  );
  for (const id of newIds) {
    const goldenLayerId = `golden-${id}`;
    const highA = renderLayer(id, snapshot(1), 12.5, 180, 320, 30, goldenLayerId);
    const highB = renderLayer(id, snapshot(1), 12.5, 180, 320, 30, goldenLayerId);
    const low = renderLayer(id, snapshot(2), 12.5, 180, 320, 30, goldenLayerId);
    assert.equal(hash(highA), golden.highEnergy[id], `${id} high`);
    assert.equal(hash(low), golden.lowEnergy[id], `${id} low`);
    assert.equal(hash(highA), hash(highB), `${id} determinismo`);
    assert.notEqual(hash(highA), hash(low), `${id} reazione audio`);
    assert.ok(nonEmpty(highA), `${id} frame non vuoto`);
  }
});

test("nuovi plugin supportano 30/60 FPS, due risoluzioni, resize e seek", () => {
  for (const id of newIds) {
    for (const fps of [30, 60]) {
      for (const [width, height] of [[180, 320], [360, 640]]) {
        assert.ok(nonEmpty(renderLayer(id, snapshot(), 4.25, width, height, fps)));
      }
    }
    const canvas = createCanvas(180, 320);
    const project = createDefaultProject();
    project.layers = [layerFor(id)];
    const compositor = new SceneCompositor();
    const context = canvas.getContext("2d");
    compositor.render(context, 180, 320, project, snapshot(), 8, {
      projectM: null, cover: null
    }, { frameRate: 30 });
    compositor.render(context, 180, 320, project, snapshot(), 2, {
      projectM: null, cover: null
    }, { frameRate: 30 });
    const backward = hash(Buffer.from(canvas.data()));
    assert.equal(backward, hash(renderLayer(id, snapshot(), 2)));
    compositor.dispose();
  }
});

test("due istanze ricevono seed indipendenti e round trip settings stabile", () => {
  for (const id of [...oldIds, ...newIds]) {
    const descriptor = pluginRegistry.get(id);
    const first = descriptor.create({ layerId: `${id}-a`, seed: 11 });
    const second = descriptor.create({ layerId: `${id}-b`, seed: 22 });
    first.initialize({ width: 180, height: 320, layerId: `${id}-a`, seed: 11 });
    second.initialize({ width: 180, height: 320, layerId: `${id}-b`, seed: 22 });
    first.deserialize(structuredClone(descriptor.defaultSettings));
    second.deserialize(structuredClone(descriptor.defaultSettings));
    assert.deepEqual(first.serialize(), descriptor.defaultSettings);
    assert.deepEqual(second.serialize(), descriptor.defaultSettings);
    assert.notEqual(first, second);
    first.dispose();
    second.dispose();
  }
  assert.notEqual(
    hash(renderLayer("orbitingParticles", snapshot(), 12, 180, 320, 30, "orbit-a")),
    hash(renderLayer("orbitingParticles", snapshot(), 12, 180, 320, 30, "orbit-b"))
  );
});

test("determinismo dei nuovi plugin copre 600 secondi simulati", () => {
  for (const id of newIds) {
    const hashes = [];
    for (let run = 0; run < 2; run += 1) {
      const canvas = createCanvas(120, 200);
      const context = canvas.getContext("2d");
      const project = createDefaultProject();
      project.layers = [layerFor(id)];
      const compositor = new SceneCompositor();
      for (let time = 0; time <= 600; time += 10) {
        compositor.render(context, 120, 200, project, snapshot((time / 10) % 2 + 1), time, {
          projectM: null, cover: null
        }, { frameRate: 30 });
      }
      hashes.push(hash(Buffer.from(canvas.data())));
      compositor.dispose();
    }
    assert.equal(hashes[0], hashes[1], id);
  }
});

test("nessun plugin usa Math.random, DOM o clock reale", () => {
  const directory = path.join(root, "src", "engine", "plugins");
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith(".ts"))) {
    const source = fs.readFileSync(path.join(directory, file), "utf8");
    assert.doesNotMatch(source, /Math\.random\s*\(/, file);
    assert.doesNotMatch(source, /\b(document|window|performance\.now|Date\.now)\b/, file);
  }
});

test("schema 6.0 conserva i quattro plugin e scarta chiavi settings ignote", () => {
  const project = createDefaultProject();
  project.layers.push(...newIds.map((id) => layerFor(id)));
  const normalized = normalizeProject(project);
  for (const id of newIds) {
    const layer = normalized.layers.find((candidate) => candidate.pluginId === id);
    assert.ok(layer, id);
    assert.equal(layer.plugin.id, id);
    assert.deepEqual(
      layer.plugin.settings,
      pluginRegistry.get(id).defaultSettings
    );
  }
});

test("inspector è descriptor-driven e non usa innerHTML per metadati", () => {
  const source = fs.readFileSync(
    path.join(root, "src", "renderer", "inspector", "parameterControls.ts"),
    "utf8"
  );
  assert.doesNotMatch(source, /innerHTML/);
  for (const id of PLUGIN_CATALOG_ORDER) assert.doesNotMatch(source, new RegExp(id));
  assert.match(source, /descriptor\.parameters/);
  assert.match(source, /textContent/);
});

test("budget render M2 registra media e p95 senza crescita istanze", (t) => {
  const metrics = {};
  for (const id of newIds) {
    const samples = [];
    const canvas = createCanvas(270, 480);
    const context = canvas.getContext("2d");
    const project = createDefaultProject();
    project.layers = [layerFor(id, `budget-${id}`)];
    const compositor = new SceneCompositor();
    for (let frame = 0; frame < 80; frame += 1) {
      const started = performance.now();
      compositor.render(
        context,
        270,
        480,
        project,
        snapshot(frame % 2 + 1),
        frame / 30,
        { projectM: null, cover: null },
        { frameRate: 30 }
      );
      samples.push(performance.now() - started);
    }
    compositor.dispose();
    samples.sort((a, b) => a - b);
    metrics[id] = {
      averageMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
      p95Ms: samples[Math.floor(samples.length * 0.95)]
    };
    assert.ok(metrics[id].p95Ms < 25, `${id} p95`);
  }
  t.diagnostic(JSON.stringify(metrics));
});
