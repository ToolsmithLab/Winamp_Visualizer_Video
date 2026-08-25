"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const {
  PROJECT_VERSION,
  createDefaultProject,
  normalizeProject,
  serializeProject
} = require("../dist/shared/project");
const {
  FutureProjectVersionError,
  migrateProjectDocument
} = require("../dist/engine/project/migrations");
const {
  ProjectStore
} = require("../dist/engine/commands/projectStore");
const {
  atomicWriteJson
} = require("../dist/main/project/atomicWrite");
const {
  loadProjectFile,
  saveProjectFile
} = require("../dist/main/project/projectFileService");

const root = path.resolve(__dirname, "..");
const projectFixtures = path.join(__dirname, "fixtures", "projects");
const goldenPath = path.join(
  __dirname,
  "fixtures",
  "golden",
  "phase2-canvas-golden.json"
);
const contractPath = path.join(
  __dirname,
  "fixtures",
  "golden",
  "phase2-contract-baseline.json"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runGoldenCandidate() {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "compute-phase3-m1-golden.cjs")],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env
    }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("baseline raster dei sei plugin è identica in tre esecuzioni", () => {
  const expected = readJson(goldenPath);
  for (let run = 0; run < 3; run += 1) {
    assert.deepEqual(runGoldenCandidate(), expected, `golden run ${run + 1}`);
  }
  assert.equal(Object.keys(expected.synthetic).length, 6);
  assert.equal(Object.keys(expected.realAudio).length, 6);
  assert.equal(expected.previewOffline.equal, true);
  assert.equal(expected.previewOffline.preview, expected.previewOffline.offline);
  assert.notEqual(
    expected.seekForwardBackward[4],
    expected.seekForwardBackward[5],
    "il seek indietro deve resettare lo stato"
  );
});

test("fixture audio reale della baseline ha hash verificato", () => {
  const golden = readJson(goldenPath);
  const audio = fs.readFileSync(
    path.join(__dirname, "fixtures", "audio", "phase2-multiband.wav")
  );
  assert.equal(
    crypto.createHash("sha256").update(audio).digest("hex"),
    golden.audioFixtureSha256
  );
  assert.equal(audio.toString("ascii", 0, 4), "RIFF");
  assert.equal(audio.toString("ascii", 8, 12), "WAVE");
});

test("baseline contratti IPC, errori e runtime nativi resta verificabile", () => {
  const baseline = readJson(contractPath);
  const { IPC } = require("../dist/shared/ipc");
  assert.equal(IPC.saveProject, baseline.ipc.projectSave);
  assert.equal(IPC.openProject, baseline.ipc.projectOpen);
  assert.equal(IPC.exportVideo, baseline.ipc.exportStart);
  assert.equal(IPC.projectMRender, baseline.ipc.projectMRender);
  assert.equal(IPC.presetImport, baseline.ipc.presetImport);
  assert.equal(IPC.presetSelect, baseline.ipc.presetSelect);
  const projectMManifest = readJson(
    path.join(root, baseline.native.projectMManifest)
  );
  assert.equal(projectMManifest.projectM.version, baseline.native.projectM);
  assert.ok(fs.existsSync(path.join(root, baseline.native.ffmpegManifest)));
});

test("engine e shared non importano renderer, DOM, Electron o Node", () => {
  const roots = [path.join(root, "src", "engine"), path.join(root, "src", "shared")];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith(".ts")) files.push(target);
    }
  };
  roots.forEach(visit);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*renderer/i, file);
    assert.doesNotMatch(source, /from\s+["']electron["']/i, file);
    assert.doesNotMatch(source, /from\s+["']node:/i, file);
    assert.doesNotMatch(
      source,
      /\bwindow\.|\bdocument\.(?:querySelector|getElementById|createElement|body)\b/,
      file
    );
  }
});

for (const version of [1, 2, 3, 4, 5]) {
  test(`fixture schema ${version}.0 migra esplicitamente a 6.0`, () => {
    const raw = readJson(
      path.join(
        projectFixtures,
        version === 5
          ? "project-v5-representative.avsproject"
          : `project-v${version}.avsproject`
      )
    );
    const migratedDocument = migrateProjectDocument(raw);
    const project = normalizeProject(raw);
    assert.equal(migratedDocument.version, "6.0");
    assert.equal(project.version, PROJECT_VERSION);
    assert.equal(project.name, raw.name);
    assert.equal(project.audioFile, raw.audioFile ?? null);
    assert.ok(project.layers.some((layer) => layer.kind === "projectM"));
    for (const layer of project.layers) {
      assert.ok(layer.transform);
      assert.ok(Array.isArray(layer.keyframes));
      if (layer.kind === "visualizer") assert.ok(layer.plugin);
    }
  });
}

test("migrazione 5.0 preserva ordine, intervalli, blend, projectM e seed", () => {
  const raw = readJson(
    path.join(projectFixtures, "project-v5-representative.avsproject")
  );
  const project = normalizeProject(raw);
  assert.deepEqual(
    project.layers.map((layer) => layer.id),
    raw.layers.map((layer) => layer.id)
  );
  assert.deepEqual(
    project.layers.map(({ opacity, blendMode, startTime, endTime }) => ({
      opacity,
      blendMode,
      startTime,
      endTime
    })),
    raw.layers.map(({ opacity, blendMode, startTime, endTime }) => ({
      opacity,
      blendMode,
      startTime,
      endTime
    }))
  );
  assert.equal(project.projectM.randomSeed, raw.projectM.randomSeed);
  assert.equal(project.projectM.particleSeed, raw.projectM.particleSeed);
  assert.deepEqual(project.projectM.transition, raw.projectM.transition);
  assert.deepEqual(project.projectM.playlistIds, raw.projectM.playlistIds);
  assert.deepEqual(project.projectM.markers, raw.projectM.markers);
  assert.deepEqual(project.projectM.history, raw.projectM.history);
  assert.equal(
    project.layers.find((layer) => layer.kind === "cover").transform.x,
    raw.cover.x
  );
  assert.equal(
    project.layers.find((layer) => layer.kind === "artistText").transform.y,
    raw.text.artistY
  );
});

test("migrazione e normalizzazione sono pure e idempotenti", () => {
  const raw = readJson(
    path.join(projectFixtures, "project-v5-representative.avsproject")
  );
  const untouched = structuredClone(raw);
  const first = normalizeProject(raw);
  const second = normalizeProject(first);
  assert.deepEqual(raw, untouched);
  assert.deepEqual(second, first);
});

test("plugin sconosciuto viene conservato ma non marcato come eseguibile", () => {
  const raw = readJson(
    path.join(projectFixtures, "project-v5-representative.avsproject")
  );
  raw.layers[1].pluginId = "visualizer-non-disponibile";
  raw.layers[1].plugin = {
    id: "visualizer-non-disponibile",
    version: "9.2.1",
    settings: { amount: 7 },
    unknownData: { vendor: "sconosciuto", payload: "conservato" }
  };
  const project = normalizeProject(raw);
  const layer = project.layers[1];
  assert.equal(layer.pluginId, undefined);
  assert.equal(layer.plugin.id, "visualizer-non-disponibile");
  assert.deepEqual(layer.plugin.unknownData, {
    vendor: "sconosciuto",
    payload: "conservato"
  });
});

test("versione futura viene rifiutata senza normalizzazione distruttiva", async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "AVS_M1_Future_"));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "future.avsproject");
  const raw = JSON.stringify({ version: "7.0", name: "Futuro", future: true }, null, 2);
  await fsp.writeFile(file, raw, "utf8");
  assert.throws(
    () => normalizeProject(JSON.parse(raw)),
    FutureProjectVersionError
  );
  await assert.rejects(() => loadProjectFile(file), /più recente.*non è stato modificato/);
  assert.equal(await fsp.readFile(file, "utf8"), raw);
});

test("input corrotto, campi errati, NaN e Infinity vengono rifiutati", () => {
  assert.throws(() => normalizeProject(null), /oggetto JSON/);
  assert.throws(
    () => normalizeProject({ version: 6, name: "bad" }),
    /versione.*stringa/i
  );
  assert.throws(
    () => normalizeProject({ version: "6.0", layers: "bad" }),
    /livelli.*array/i
  );
  assert.throws(
    () => normalizeProject({ version: "6.0", canvas: { width: NaN } }),
    /non finito/
  );
  assert.throws(
    () => normalizeProject({ version: "6.0", canvas: { width: Infinity } }),
    /non finito/
  );
});

test("serializzazione esclude dati runtime e binari", () => {
  const project = createDefaultProject();
  assert.throws(
    () => serializeProject({ ...project, pcm: new Float32Array(8) }),
    /Dati binari runtime|Campo runtime/
  );
  assert.throws(
    () => serializeProject({ ...project, playhead: 1.5 }),
    /Campo runtime/
  );
  const serialized = serializeProject(project);
  assert.doesNotMatch(
    serialized,
    /"pcm"|"framebuffer"|"bitmap"|"errorCount"|"metrics"|"playhead"|"pid"/
  );
});

test("salvataggio atomico conserva originale e backup con fault injection", async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "AVS_M1_Atomic_"));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "project.avsproject");
  const original = JSON.stringify({ version: "5.0", name: "Originale" }, null, 2);
  const replacement = JSON.stringify({ version: "6.0", name: "Nuovo" }, null, 2);
  await fsp.writeFile(file, original, "utf8");

  for (const fault of ["write", "disk-full", "interrupt", "rename", "invalid-json"]) {
    await assert.rejects(() => atomicWriteJson(file, replacement, { fault }));
    assert.equal(await fsp.readFile(file, "utf8"), original, fault);
  }

  const saved = await saveProjectFile(file, createDefaultProject());
  assert.equal(saved.version, "6.0");
  assert.equal(readJson(file).version, "6.0");
  assert.equal(await fsp.readFile(`${file}.bak`, "utf8"), original);
  const leftovers = (await fsp.readdir(directory)).filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(leftovers, []);
});

test("JSON invalido non crea o sostituisce il target atomico", async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "AVS_M1_Invalid_"));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "project.avsproject");
  await fsp.writeFile(file, "{\"version\":\"5.0\"}", "utf8");
  await assert.rejects(() => atomicWriteJson(file, "{"), /JSON non valido/);
  assert.equal(await fsp.readFile(file, "utf8"), "{\"version\":\"5.0\"}");
});

test("dirty state segue revision e saved revision senza cancellare history", () => {
  const store = new ProjectStore();
  assert.equal(store.isDirty, false);
  store.update((project) => {
    project.name = "Modificato";
  }, "Nome");
  assert.equal(store.isDirty, true);
  const saved = structuredClone(store.project);
  store.acceptSaved(saved);
  assert.equal(store.isDirty, false);
  assert.equal(store.canUndo, true);
  store.update((project) => {
    project.text.title = "Dopo save";
  }, "Titolo");
  assert.equal(store.isDirty, true);
  assert.equal(store.undo(), true);
  assert.equal(store.isDirty, false);
  assert.equal(store.redo(), true);
  assert.equal(store.isDirty, true);
});

test("slider 100 eventi e drag 300 eventi producono un comando ciascuno", () => {
  const slider = new ProjectStore();
  slider.beginTransaction("Slider");
  for (let index = 0; index < 100; index += 1) {
    slider.update((project) => {
      project.layers[1].opacity = index / 100;
    }, "Slider");
  }
  slider.commitTransaction();
  assert.equal(slider.historySnapshot().history.undoCount, 1);
  assert.ok(
    slider.historySnapshot().history.estimatedBytes < 16_384,
    "lo slider deve memorizzare un delta circoscritto"
  );
  assert.equal(slider.undo(), true);
  assert.equal(slider.project.layers[1].opacity, 1);

  const drag = new ProjectStore();
  const startX = drag.project.cover.x;
  drag.beginTransaction("Drag");
  for (let index = 0; index < 300; index += 1) {
    drag.update((project) => {
      project.cover.x = 0.1 + index / 1000;
      project.layers.find((layer) => layer.kind === "cover").transform.x =
        project.cover.x;
    }, "Drag");
  }
  drag.commitTransaction();
  assert.equal(drag.historySnapshot().history.undoCount, 1);
  drag.undo();
  assert.equal(drag.project.cover.x, startX);
});

test("annullare una transazione ripristina stato senza history", () => {
  const store = new ProjectStore();
  const before = structuredClone(store.project);
  store.beginTransaction("Gesto annullato");
  store.update((project) => {
    project.cover.x = 0.9;
  });
  assert.equal(store.isDirty, true);
  assert.equal(store.cancelTransaction(), true);
  assert.deepEqual(store.project, before);
  assert.equal(store.historySnapshot().history.undoCount, 0);
  assert.equal(store.isDirty, false);
});

test("add, duplicate, delete e move layer sono reversibili", () => {
  const store = new ProjectStore();
  const initialIds = store.project.layers.map((layer) => layer.id);
  const source = structuredClone(store.project.layers[1]);
  const added = { ...structuredClone(source), id: "visualizer-added" };
  const duplicate = { ...structuredClone(source), id: "visualizer-duplicate" };
  store.update((project) => project.layers.push(added), "Add");
  store.update((project) => project.layers.push(duplicate), "Duplicate");
  store.update((project) => {
    const [moved] = project.layers.splice(project.layers.length - 1, 1);
    project.layers.splice(1, 0, moved);
  }, "Move");
  store.update((project) => {
    const index = project.layers.findIndex((layer) => layer.id === added.id);
    project.layers.splice(index, 1);
  }, "Delete");
  for (let index = 0; index < 4; index += 1) assert.equal(store.undo(), true);
  assert.deepEqual(store.project.layers.map((layer) => layer.id), initialIds);
  for (let index = 0; index < 4; index += 1) assert.equal(store.redo(), true);
  assert.equal(
    store.project.layers.some((layer) => layer.id === duplicate.id),
    true
  );
});

test("200 undo, 200 redo, invalidazione redo e reset nuovo/apri", () => {
  const store = new ProjectStore();
  for (let index = 1; index <= 200; index += 1) {
    store.update((project) => {
      project.name = `Revision ${index}`;
    }, "Nome");
  }
  assert.equal(store.historySnapshot().history.undoCount, 200);
  for (let index = 0; index < 200; index += 1) assert.equal(store.undo(), true);
  assert.equal(store.project.name, "Progetto senza titolo");
  for (let index = 0; index < 200; index += 1) assert.equal(store.redo(), true);
  assert.equal(store.project.name, "Revision 200");
  store.undo();
  assert.equal(store.canRedo, true);
  store.update((project) => {
    project.name = "Nuovo ramo";
  });
  assert.equal(store.canRedo, false);
  store.reset(createDefaultProject());
  assert.equal(store.canUndo, false);
  assert.equal(store.canRedo, false);
  assert.equal(store.isDirty, false);
});

test("history rispetta 200 comandi e 32 MiB stimati", () => {
  const store = new ProjectStore();
  const chunk = "x".repeat(1024 * 1024);
  for (let index = 0; index < 40; index += 1) {
    store.update((project) => {
      project.text.title = `${index}-${chunk}`;
    }, "Titolo grande");
  }
  const snapshot = store.historySnapshot().history;
  assert.ok(snapshot.undoCount <= 200);
  assert.ok(snapshot.estimatedBytes <= 32 * 1024 * 1024);
  assert.equal(snapshot.maxCommands, 200);
  assert.equal(snapshot.maxBytes, 32 * 1024 * 1024);
});
