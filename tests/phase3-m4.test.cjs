"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createDefaultProject,
  normalizeProject
} = require("../dist/shared/project");
const {
  PROJECT_PRESET_FORMAT,
  PROJECT_PRESET_LIMITS,
  PROJECT_PRESET_VERSION,
  applyProjectPreset,
  applyResolvedProjectPreset,
  createProjectPresetDocument,
  inspectProjectPresetCompatibility,
  validateProjectPreset
} = require("../dist/shared/projectPreset");
const {
  compareAssetCandidate,
  extensionForPath,
  exportBlockingAssets,
  isSupportedAssetExtension,
  markAssetIgnored,
  removeProjectAsset,
  unresolvedAssets,
  updateProjectAsset,
  updateProjectAssets
} = require("../dist/engine/project/assetResolver");
const {
  ProjectPresetService,
  decodeStrictUtf8,
  parseProjectPreset
} = require("../dist/main/project/projectPresetService");
const {
  ASSET_SEARCH_LIMITS,
  MediaRelinkService
} = require("../dist/main/project/mediaRelinkService");
const { ProjectStore } = require("../dist/engine/commands/projectStore");
const {
  loadProjectFile,
  saveProjectFile
} = require("../dist/main/project/projectFileService");

const root = path.resolve(__dirname, "..");

function metadata(id = "preset-progetto-test") {
  return {
    id,
    name: "Configurazione Ω 日本語",
    description: "Testo <script>alert('inerte')</script> trattato come testo.",
    author: null,
    createdAt: "2026-07-29T12:00:00.000Z",
    modifiedAt: "2026-07-29T12:00:00.000Z"
  };
}

function options(overrides = {}) {
  return {
    audio: false,
    cover: false,
    milkdropPreset: false,
    textures: false,
    ...overrides
  };
}

function projectPreset(project = createDefaultProject(), id) {
  return createProjectPresetDocument(project, metadata(id), options());
}

function clone(value) {
  return structuredClone(value);
}

async function temporaryDirectory(label) {
  return fsp.mkdtemp(path.join(os.tmpdir(), `avs-m4-${label}-`));
}

function sha(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function asset(overrides = {}) {
  return {
    id: "project-audio",
    type: "audio",
    path: null,
    originalPath: "C:\\spostato\\brano.wav",
    relativePath: "media/brano.wav",
    fileName: "brano.wav",
    size: 44,
    hash: "a".repeat(64),
    status: "missing",
    required: true,
    ...overrides
  };
}

test("formato .avspreset 1.0 round-trip UTF-8 conserva configurazione visuale", () => {
  const project = createDefaultProject();
  project.text.artist = "Artista Ω";
  project.text.title = "日本語 — Titolo";
  project.layers[0].keyframes = [
    {
      id: "kf-1",
      property: "opacity",
      time: 1.25,
      value: 0.4,
      interpolation: "ease-in-out"
    }
  ];
  const preset = projectPreset(project);
  const roundTrip = validateProjectPreset(
    JSON.parse(JSON.stringify(preset))
  );
  assert.equal(roundTrip.format, PROJECT_PRESET_FORMAT);
  assert.equal(roundTrip.version, PROJECT_PRESET_VERSION);
  assert.equal(roundTrip.metadata.name, "Configurazione Ω 日本語");
  assert.equal(roundTrip.visual.text.title, project.text.title);
  assert.deepEqual(roundTrip.visual.layers[0].keyframes, project.layers[0].keyframes);
});

test("Preset di progetto non incorpora percorsi assoluti o dati binari", () => {
  const project = createDefaultProject();
  project.audioFile = "C:\\media\\brano.wav";
  project.assets = [
    asset({
      path: project.audioFile,
      originalPath: project.audioFile,
      hash: "b".repeat(64)
    })
  ];
  const preset = createProjectPresetDocument(
    project,
    metadata(),
    options({ audio: true })
  );
  assert.equal(preset.assets[0].path, null);
  assert.equal(preset.assets[0].originalPath, null);
  const serialized = JSON.stringify(preset);
  assert.equal(serialized.includes("C:\\\\media"), false);
  assert.throws(
    () =>
      validateProjectPreset({
        ...preset,
        assets: [{ ...preset.assets[0], path: "C:\\evil\\payload.exe" }]
      }),
    /percorsi assoluti/i
  );
});

test("applicare un preset senza asset conserva integralmente il manifest corrente", () => {
  const current = createDefaultProject();
  current.audioFile = "D:\\Media\\brano.wav";
  current.assets = [
    {
      id: "project-audio",
      type: "audio",
      path: current.audioFile,
      originalPath: current.audioFile,
      relativePath: "media\\brano.wav",
      fileName: "brano.wav",
      size: 1234,
      hash: "a".repeat(64),
      status: "available",
      required: true
    }
  ];
  const preset = createProjectPresetDocument(
    current,
    {
      id: crypto.randomUUID(),
      name: "Senza asset",
      description: "",
      author: null,
      createdAt: new Date(0).toISOString(),
      modifiedAt: new Date(0).toISOString()
    },
    {
      audio: false,
      cover: false,
      milkdropPreset: false,
      textures: false
    }
  );
  const applied = applyProjectPreset(current, preset);
  assert.deepEqual(applied.project.assets, current.assets);
  assert.equal(applied.project.audioFile, current.audioFile);
});

test("validator rifiuta JSON vuoto, corrotto, enorme e UTF-8 non valido", () => {
  assert.throws(() => parseProjectPreset(Buffer.alloc(0)), /vuoto/i);
  assert.throws(
    () => parseProjectPreset(Buffer.from("{", "utf8")),
    /JSON non valido/i
  );
  assert.throws(
    () => parseProjectPreset(Buffer.alloc(PROJECT_PRESET_LIMITS.fileBytes + 1)),
    /troppo grande/i
  );
  assert.throws(
    () => decodeStrictUtf8(Buffer.from([0xc3, 0x28])),
    /UTF-8/i
  );
});

test("validator rifiuta versione futura, tipi errati e numeri non finiti", () => {
  const preset = projectPreset();
  assert.throws(
    () => validateProjectPreset({ ...preset, version: "99.0" }),
    /non supportata/i
  );
  const wrong = clone(preset);
  wrong.visual.canvas.width = "1080";
  assert.throws(() => validateProjectPreset(wrong), /numero finito/i);
  const infinite = clone(preset);
  infinite.visual.layers[0].opacity = Infinity;
  assert.throws(() => validateProjectPreset(infinite), /non finito/i);
});

test("validator rifiuta profondità, quantità e stringhe oltre limite", () => {
  const preset = projectPreset();
  const tooManyLayers = clone(preset);
  tooManyLayers.visual.layers = Array.from(
    { length: PROJECT_PRESET_LIMITS.layers + 1 },
    () => clone(preset.visual.layers[0])
  );
  assert.throws(() => validateProjectPreset(tooManyLayers), /Troppi livelli/i);
  const long = clone(preset);
  long.metadata.description = "x".repeat(
    PROJECT_PRESET_LIMITS.stringLength + 1
  );
  assert.throws(() => validateProjectPreset(long), /Stringa troppo lunga/i);
  let nested = {};
  const deep = nested;
  for (let index = 0; index < PROJECT_PRESET_LIMITS.depth + 2; index += 1) {
    nested.next = {};
    nested = nested.next;
  }
  assert.throws(
    () => validateProjectPreset({ ...preset, extra: deep }),
    /troppo annidato/i
  );
});

test("prototype pollution e campi eseguibili/runtime sono bloccati", () => {
  const preset = projectPreset();
  const polluted = JSON.parse(
    JSON.stringify(preset).replace(
      `"format":"${PROJECT_PRESET_FORMAT}"`,
      `"__proto__":{"polluted":true},"format":"${PROJECT_PRESET_FORMAT}"`
    )
  );
  assert.throws(() => validateProjectPreset(polluted), /Proprietà vietata/i);
  assert.equal({}.polluted, undefined);
  assert.throws(
    () => validateProjectPreset({ ...preset, command: "calc.exe" }),
    /eseguibile vietato/i
  );
  assert.throws(
    () => validateProjectPreset({ ...preset, framebuffer: [1, 2, 3] }),
    /runtime o eseguibile/i
  );
});

test("traversal, device path, URL ed estensione eseguibile sono rifiutati", () => {
  const preset = projectPreset();
  const attempts = [
    "../escape/brano.wav",
    "C:\\assoluto\\brano.wav",
    "\\\\?\\C:\\brano.wav",
    "file:///C:/brano.wav",
    "https://example.test/brano.wav"
  ];
  for (const relativePath of attempts) {
    assert.throws(
      () =>
        validateProjectPreset({
          ...preset,
          assets: [
            {
              ...asset({
                path: null,
                originalPath: null,
                relativePath
              })
            }
          ]
        }),
      /Percorso asset non sicuro/i
    );
  }
  assert.throws(
    () =>
      validateProjectPreset({
        ...preset,
        assets: [
          asset({
            path: null,
            originalPath: null,
            relativePath: "media/payload.exe",
            fileName: "payload.exe"
          })
        ]
      }),
    /Estensione asset non ammessa/i
  );
});

test("HTML e JavaScript in metadati restano testo inerte e non sono interpretati", () => {
  const preset = projectPreset();
  const validated = validateProjectPreset(preset);
  assert.equal(validated.metadata.description.includes("<script>"), true);
  const renderer = fs.readFileSync(
    path.join(root, "src", "renderer", "projectPresets", "projectPresetView.ts"),
    "utf8"
  );
  assert.match(renderer, /textContent/);
  assert.doesNotMatch(renderer, /\.innerHTML|insertAdjacentHTML|eval\(|new Function/);
});

test("plugin mancante è preservato e richiede applicazione parziale esplicita", () => {
  const preset = projectPreset();
  const missingLayer = {
    ...clone(preset.visual.layers.find((layer) => layer.kind === "visualizer")),
    id: "missing-plugin-layer",
    name: "Plugin non installato",
    plugin: {
      id: "plugin-futuro-non-installato",
      version: "9.0.0",
      settings: { intensity: 1 },
      unknownData: { vendor: "test" }
    }
  };
  delete missingLayer.pluginId;
  preset.visual.layers.push(missingLayer);
  const validated = validateProjectPreset(preset);
  const compatibility = inspectProjectPresetCompatibility(validated);
  assert.deepEqual(compatibility.missingPluginIds, [
    "plugin-futuro-non-installato"
  ]);
  assert.equal(
    validated.visual.layers.at(-1).plugin.id,
    "plugin-futuro-non-installato"
  );
  assert.throws(
    () => applyProjectPreset(createDefaultProject(), validated),
    /conferma esplicitamente/i
  );
  const partial = applyProjectPreset(
    createDefaultProject(),
    validated,
    true
  );
  assert.equal(partial.partial, true);
});

test("applicazione Preset di progetto è un solo comando con undo/redo", () => {
  const initial = createDefaultProject();
  const changed = clone(initial);
  changed.canvas.accentColor = "#123456";
  changed.text.title = "Preset applicato";
  const preset = projectPreset(changed);
  const candidate = applyProjectPreset(initial, preset).project;
  const store = new ProjectStore(initial);
  store.update(
    (draft) => Object.assign(draft, clone(candidate)),
    "Applica Preset di progetto"
  );
  assert.equal(store.project.text.title, "Preset applicato");
  assert.equal(store.historySnapshot().history.undoCount, 1);
  assert.equal(store.undo(), true);
  assert.equal(store.project.text.title, initial.text.title);
  assert.equal(store.redo(), true);
  assert.equal(store.project.canvas.accentColor, "#123456");
});

test("anteprima/cancel del servizio non mutano progetto, history o dirty state", async () => {
  const directory = await temporaryDirectory("preview");
  try {
    const service = new ProjectPresetService(directory);
    const project = createDefaultProject();
    project.text.title = "Candidato";
    const record = await service.create({
      project,
      name: "Preview",
      description: "",
      author: null,
      includeAssets: options()
    });
    const store = new ProjectStore(createDefaultProject());
    const before = JSON.stringify(store.project);
    const beforeHistory = store.historySnapshot();
    const preview = await service.preview(record.id, store.project);
    assert.equal(preview.candidate.text.title, "Candidato");
    assert.equal(JSON.stringify(store.project), before);
    assert.deepEqual(store.historySnapshot(), beforeHistory);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("libreria Preset di progetto supporta CRUD, ricerca e persistenza", async () => {
  const directory = await temporaryDirectory("library");
  try {
    const service = new ProjectPresetService(directory);
    const created = await service.create({
      project: createDefaultProject(),
      name: "Notte Ω",
      description: "Descrizione",
      author: "Autore",
      includeAssets: options()
    });
    assert.equal((await service.list({ search: "notte" })).length, 1);
    const renamed = await service.rename(created.id, "Alba 日本語");
    assert.equal(renamed.name, "Alba 日本語");
    const duplicate = await service.duplicate(created.id);
    assert.notEqual(duplicate.id, created.id);
    assert.equal((await service.list()).length, 2);
    const restarted = new ProjectPresetService(directory);
    assert.equal((await restarted.list()).length, 2);
    await restarted.delete(duplicate.id);
    assert.equal((await restarted.list()).length, 1);
    assert.equal((await restarted.verifyLibrary()).invalidFiles.length, 0);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("import/export .avspreset usa JSON normalizzato e ID duplicato è bloccato", async () => {
  const directory = await temporaryDirectory("import");
  const sourceDirectory = await temporaryDirectory("source");
  try {
    const source = path.join(sourceDirectory, "Configurazione Ω.avspreset");
    await fsp.writeFile(
      source,
      `${JSON.stringify(projectPreset(), null, 2)}\n`,
      "utf8"
    );
    const service = new ProjectPresetService(directory);
    const imported = await service.importPreset(source);
    assert.equal(imported.name, "Configurazione Ω 日本語");
    await assert.rejects(() => service.importPreset(source), /stesso ID/i);
    const destination = path.join(sourceDirectory, "esportato.avspreset");
    await service.export(imported.id, destination);
    const exported = parseProjectPreset(await fsp.readFile(destination));
    assert.equal(exported.metadata.id, imported.id);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
    await fsp.rm(sourceDirectory, { recursive: true, force: true });
  }
});

test("file .avspreset symlink è rifiutato quando il sistema lo consente", async (t) => {
  const directory = await temporaryDirectory("symlink-library");
  const sourceDirectory = await temporaryDirectory("symlink-source");
  try {
    const source = path.join(sourceDirectory, "source.avspreset");
    const link = path.join(sourceDirectory, "link.avspreset");
    await fsp.writeFile(source, JSON.stringify(projectPreset()), "utf8");
    try {
      await fsp.symlink(source, link, "file");
    } catch (error) {
      t.skip(`Symlink non disponibile: ${error.code || error.message}`);
      return;
    }
    const service = new ProjectPresetService(directory);
    await assert.rejects(() => service.importPreset(link), /Symlink|reparse/i);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
    await fsp.rm(sourceDirectory, { recursive: true, force: true });
  }
});

test("confronto asset distingue hash valido, mismatch e tipo non supportato", () => {
  const expected = asset();
  const candidate = {
    path: "D:\\media\\brano.wav",
    fileName: "brano.wav",
    size: 44,
    hash: expected.hash,
    supported: true
  };
  assert.equal(compareAssetCandidate(expected, candidate).status, "relinked");
  const mismatch = compareAssetCandidate(expected, {
    ...candidate,
    hash: "b".repeat(64)
  });
  assert.equal(mismatch.status, "hash-mismatch");
  assert.equal(mismatch.requiresConfirmation, true);
  assert.equal(
    compareAssetCandidate(expected, {
      ...candidate,
      path: "D:\\media\\payload.exe",
      supported: false
    }).status,
    "unsupported"
  );
});

test("hash mismatch non modifica nulla senza conferma e diventa undoable come batch", () => {
  const project = createDefaultProject();
  project.audioFile = null;
  project.assets = [asset()];
  const match = compareAssetCandidate(project.assets[0], {
    path: "D:\\nuovo\\brano.wav",
    fileName: "brano.wav",
    size: 44,
    hash: "b".repeat(64),
    supported: true
  });
  assert.throws(() => updateProjectAsset(project, match), /conferma/i);
  assert.equal(project.assets[0].path, null);
  const updated = updateProjectAssets(project, [match], new Set([match.assetId]));
  assert.equal(updated.audioFile, "D:\\nuovo\\brano.wav");
  assert.equal(updated.assets[0].status, "relinked");
  assert.equal(project.audioFile, null);
});

test("asset opzionale ignorabile, essenziale blocca export", () => {
  const project = createDefaultProject();
  project.assets = [
    asset(),
    asset({
      id: "cover",
      type: "cover",
      fileName: "cover.png",
      relativePath: "cover.png",
      required: false
    })
  ];
  assert.equal(unresolvedAssets(project).length, 2);
  assert.deepEqual(exportBlockingAssets(project).map((item) => item.id), [
    "project-audio"
  ]);
  const ignored = markAssetIgnored(project, "cover");
  assert.equal(ignored.assets[1].status, "ignored");
  assert.throws(() => markAssetIgnored(project, "project-audio"), /essenziale/i);
  const removed = removeProjectAsset(project, "cover");
  assert.equal(removed.assets.some((item) => item.id === "cover"), false);
  assert.throws(() => removeProjectAsset(project, "project-audio"), /essenziale/i);
});

test("MediaRelinkService verifica magic bytes, SHA-256 e ricerca ricorsiva", async () => {
  const directory = await temporaryDirectory("media");
  try {
    const nested = path.join(directory, "sottocartella Ω");
    await fsp.mkdir(nested);
    const wav = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.alloc(4),
      Buffer.from("WAVEfmt "),
      Buffer.alloc(28)
    ]);
    const audioPath = path.join(nested, "brano.wav");
    await fsp.writeFile(audioPath, wav);
    const reference = asset({
      size: wav.length,
      hash: sha(wav),
      originalPath: null
    });
    const service = new MediaRelinkService();
    const inspected = await service.inspect(reference, audioPath);
    assert.equal(inspected.status, "relinked");
    const matches = await service.search([reference], directory, true);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].candidate.path, audioPath);
    assert.equal(ASSET_SEARCH_LIMITS.files, 10_000);
    const fake = path.join(directory, "falso.wav");
    await fsp.writeFile(fake, "non è un WAV");
    const unsupported = await service.inspect(
      { ...reference, fileName: "falso.wav", hash: null },
      fake
    );
    assert.equal(unsupported.status, "unsupported");
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("manifest asset salva nome, dimensione, hash, stato e percorso relativo", async () => {
  const directory = await temporaryDirectory("manifest");
  try {
    const wav = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.alloc(4),
      Buffer.from("WAVEfmt "),
      Buffer.alloc(28)
    ]);
    const audioPath = path.join(directory, "audio Ω.wav");
    const projectPath = path.join(directory, "progetto.avsproject");
    await fsp.writeFile(audioPath, wav);
    const project = createDefaultProject();
    project.audioFile = audioPath;
    const service = new MediaRelinkService();
    const synchronized = await service.synchronizeManifest(project, projectPath);
    assert.equal(synchronized.assets.length, 1);
    assert.equal(synchronized.assets[0].fileName, "audio Ω.wav");
    assert.equal(synchronized.assets[0].size, wav.length);
    assert.equal(synchronized.assets[0].hash, sha(wav));
    assert.equal(synchronized.assets[0].relativePath, "audio Ω.wav");
    assert.equal(synchronized.assets[0].required, true);
    await saveProjectFile(projectPath, synchronized);
    const reopened = await loadProjectFile(projectPath);
    assert.deepEqual(reopened.assets, synchronized.assets);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("progetto con audio/cover mancanti conserva riferimenti e apre senza crash", async () => {
  const directory = await temporaryDirectory("missing");
  try {
    const projectPath = path.join(directory, "mancanti.avsproject");
    const project = createDefaultProject();
    project.audioFile = path.join(directory, "spostato.wav");
    project.cover.filePath = path.join(directory, "spostata.png");
    await saveProjectFile(projectPath, project);
    const service = new MediaRelinkService();
    const loaded = await loadProjectFile(projectPath);
    const manifest = await service.synchronizeManifest(loaded, projectPath);
    const resolved = await service.resolveProject(manifest, projectPath);
    assert.equal(resolved.audioFile, project.audioFile);
    assert.equal(resolved.cover.filePath, project.cover.filePath);
    assert.equal(resolved.assets.length, 2);
    assert.equal(resolved.assets.every((item) => item.status === "missing"), true);
    assert.equal(resolved.assets.every((item) => item.path === null), true);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("normalizzazione schema 6 mantiene i nuovi campi manifest", () => {
  const project = createDefaultProject();
  project.assets = [asset()];
  const normalized = normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(normalized.assets[0], project.assets[0]);
});

test("IPC M4 è specifico e preload non espone filesystem generico nuovo", () => {
  const { IPC } = require("../dist/shared/ipc");
  assert.equal(IPC.projectPresetImport, "project-presets:import");
  assert.equal(IPC.projectPresetPreview, "project-presets:preview");
  assert.equal(IPC.assetChooseReplacement, "assets:choose-replacement");
  assert.equal(IPC.assetSearchFolder, "assets:search-folder");
  const preload = fs.readFileSync(
    path.join(root, "src", "preload", "preload.ts"),
    "utf8"
  );
  assert.doesNotMatch(preload, /readFileGeneric|writeFileGeneric|execute|childProcess/);
});

test("terminologia Preset di progetto resta distinta da Preset MilkDrop", () => {
  const app = fs.readFileSync(
    path.join(root, "src", "renderer", "app.ts"),
    "utf8"
  );
  assert.match(app, />Preset di progetto</);
  assert.match(app, /Preset MilkDrop/);
  assert.match(app, />Libreria preset</);
  assert.doesNotMatch(app, /plugin MilkDrop/i);
});

test("nessuna API di esecuzione è usata nella pipeline .avspreset/relink", () => {
  const files = [
    "src/shared/projectPreset.ts",
    "src/main/project/projectPresetService.ts",
    "src/main/project/mediaRelinkService.ts",
    "src/renderer/projectPresets/projectPresetView.ts",
    "src/renderer/projectAssets/assetRelinkView.ts"
  ];
  const source = files
    .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
    .join("\n");
  assert.doesNotMatch(
    source,
    /\beval\s*\(|new\s+Function|child_process|execFile|spawn\s*\(|powershell(?:\.exe)?\s+-(?:command|file)|cmd\.exe/i
  );
  assert.doesNotMatch(source, /\bimport\s*\(\s*[^"'`]/);
});

test("resolver copre estensioni, cover, MilkDrop e texture senza mutare input", () => {
  assert.equal(extensionForPath("C:\\Media\\Cover.JPEG"), ".jpeg");
  assert.equal(isSupportedAssetExtension("cover", "cover.webp"), true);
  assert.equal(isSupportedAssetExtension("audio", "cover.webp"), false);
  const project = createDefaultProject();
  project.assets = [
    asset({
      id: "cover",
      type: "cover",
      fileName: "cover.png",
      relativePath: "cover.png",
      required: false
    }),
    asset({
      id: "milk",
      type: "milkdrop-preset",
      fileName: "visual.milk",
      relativePath: "visual.milk",
      required: true
    }),
    asset({
      id: "texture",
      type: "texture",
      fileName: "texture.png",
      relativePath: "texture.png",
      originalPath: "C:\\old\\texture.png",
      required: false
    })
  ];
  project.projectM.texturePaths = ["C:\\old\\texture.png"];
  const matches = project.assets.map((item, index) => ({
    assetId: item.id,
    candidate: {
      path: `D:\\new\\${item.fileName}`,
      fileName: item.fileName,
      size: 100 + index,
      hash: String(index + 1).repeat(64),
      supported: true
    },
    status: "relinked",
    requiresConfirmation: false,
    reason: "test"
  }));
  const updated = updateProjectAssets(project, matches);
  assert.equal(updated.cover.filePath, "D:\\new\\cover.png");
  assert.equal(updated.projectM.presetPath, "D:\\new\\visual.milk");
  assert.deepEqual(updated.projectM.texturePaths, ["D:\\new\\texture.png"]);
  assert.equal(project.cover.filePath, null);
});

test("applicazione risolta usa solo asset selezionati e non usa mismatch", () => {
  const current = createDefaultProject();
  current.audioFile = "C:\\current\\audio.wav";
  const preset = projectPreset();
  preset.includeAssets = options({
    audio: true,
    cover: true,
    milkdropPreset: true,
    textures: true
  });
  preset.assets = [
    asset({
      path: "D:\\resolved\\audio.wav",
      originalPath: "D:\\resolved\\audio.wav",
      status: "available"
    }),
    asset({
      id: "cover",
      type: "cover",
      path: "D:\\resolved\\cover.png",
      originalPath: "D:\\resolved\\cover.png",
      relativePath: "cover.png",
      fileName: "cover.png",
      status: "hash-mismatch",
      required: false
    }),
    asset({
      id: "texture",
      type: "texture",
      path: "D:\\resolved\\texture.png",
      originalPath: "D:\\resolved\\texture.png",
      relativePath: "texture.png",
      fileName: "texture.png",
      status: "available",
      required: false
    })
  ];
  const result = applyResolvedProjectPreset(current, preset, true);
  assert.equal(result.project.audioFile, "D:\\resolved\\audio.wav");
  assert.equal(result.project.cover.filePath, null);
  assert.deepEqual(result.project.projectM.texturePaths, [
    "D:\\resolved\\texture.png"
  ]);
  assert.equal(result.compatibility.hashMismatches.length, 1);
});

test("servizio segnala file orfani, ordinamento e import non valido", async () => {
  const directory = await temporaryDirectory("library-errors");
  const sourceDirectory = await temporaryDirectory("library-errors-source");
  try {
    const service = new ProjectPresetService(directory);
    await service.create({
      project: createDefaultProject(),
      name: "A",
      includeAssets: options()
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.create({
      project: createDefaultProject(),
      name: "B",
      includeAssets: options()
    });
    const descending = await service.list({
      sort: "name",
      direction: "desc"
    });
    assert.deepEqual(descending.map((item) => item.name), ["B", "A"]);
    await fsp.writeFile(
      path.join(directory, "files", "orfano.avspreset"),
      JSON.stringify(projectPreset(undefined, "orfano")),
      "utf8"
    );
    assert.deepEqual((await service.verifyLibrary()).invalidFiles, [
      "orfano.avspreset"
    ]);
    const wrongExtension = path.join(sourceDirectory, "preset.json");
    await fsp.writeFile(wrongExtension, "{}", "utf8");
    await assert.rejects(
      () => service.importPreset(wrongExtension),
      /\.avspreset/i
    );
    const corrupt = path.join(sourceDirectory, "corrotto.avspreset");
    await fsp.writeFile(corrupt, "{", "utf8");
    await assert.rejects(() => service.importPreset(corrupt), /JSON non valido/i);
    const exportedWithoutExtension = path.join(sourceDirectory, "export-no-ext");
    await service.export(descending[0].id, exportedWithoutExtension);
    assert.equal(
      await fsp
        .stat(`${exportedWithoutExtension}.avspreset`)
        .then((item) => item.isFile()),
      true
    );
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
    await fsp.rm(sourceDirectory, { recursive: true, force: true });
  }
});

test("media resolver copre PNG, MilkDrop, risoluzione relativa e mismatch", async () => {
  const directory = await temporaryDirectory("media-types");
  try {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 0
    ]);
    const coverPath = path.join(directory, "cover.png");
    const milkPath = path.join(directory, "visual.milk");
    await fsp.writeFile(coverPath, png);
    await fsp.writeFile(milkPath, "[preset00]\nfRating=3.0\n", "utf8");
    const service = new MediaRelinkService();
    const coverMatch = await service.inspect(
      asset({
        id: "cover",
        type: "cover",
        fileName: "cover.png",
        relativePath: "cover.png",
        hash: sha(png),
        size: png.length,
        required: false
      }),
      coverPath
    );
    assert.equal(coverMatch.status, "relinked");
    const milkBytes = await fsp.readFile(milkPath);
    const milkReference = asset({
      id: "milk",
      type: "milkdrop-preset",
      fileName: "visual.milk",
      relativePath: "visual.milk",
      hash: sha(milkBytes),
      size: milkBytes.length,
      required: true
    });
    assert.equal((await service.inspect(milkReference, milkPath)).status, "relinked");
    const projectPath = path.join(directory, "project.avsproject");
    const project = createDefaultProject();
    project.assets = [
      {
        ...milkReference,
        path: null,
        originalPath: null,
        status: "missing"
      }
    ];
    const resolved = await service.resolveProject(project, projectPath);
    assert.equal(resolved.assets[0].status, "relinked");
    const mismatched = await service.resolveProject(
      {
        ...project,
        assets: [{ ...project.assets[0], hash: "f".repeat(64) }]
      },
      projectPath
    );
    assert.equal(mismatched.assets[0].status, "hash-mismatch");
    await assert.rejects(
      () => service.inspect(milkReference, "relative.milk"),
      /non autorizzato/i
    );
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("validator copre date, hash, dimensione, booleani e keyframe errati", () => {
  const base = projectPreset();
  const attempts = [
    () => {
      const value = clone(base);
      value.metadata.createdAt = "non-data";
      return value;
    },
    () => ({
      ...base,
      assets: [
        asset({
          path: null,
          originalPath: null,
          hash: "1234"
        })
      ]
    }),
    () => ({
      ...base,
      assets: [
        asset({
          path: null,
          originalPath: null,
          size: -1
        })
      ]
    }),
    () => {
      const value = clone(base);
      value.visual.projectM.enabled = "yes";
      return value;
    },
    () => {
      const value = clone(base);
      value.visual.layers[0].keyframes = {};
      return value;
    }
  ];
  for (const create of attempts) {
    assert.throws(() => validateProjectPreset(create()));
  }
});

test("percorso Unicode oltre 260 caratteri attraversa import .avspreset", async (t) => {
  const rootDirectory = await temporaryDirectory("long-unicode");
  try {
    let directory = rootDirectory;
    for (let index = 0; index < 8; index += 1) {
      directory = path.join(
        directory,
        `segmento-${String(index).padStart(2, "0")}-Ω-日本語-abcdefghijklmnop`
      );
    }
    try {
      await fsp.mkdir(directory, { recursive: true });
    } catch (error) {
      t.skip(`Long path non disponibile: ${error.code || error.message}`);
      return;
    }
    const source = path.join(directory, "Configurazione lunga Ω.avspreset");
    assert.ok(source.length > 260);
    await fsp.writeFile(source, JSON.stringify(projectPreset()), "utf8");
    const service = new ProjectPresetService(path.join(rootDirectory, "library"));
    const imported = await service.importPreset(source);
    assert.equal(imported.name, "Configurazione Ω 日本語");
  } finally {
    await fsp.rm(rootDirectory, { recursive: true, force: true });
  }
});

test("progetto spostato risolve asset relativo nella nuova directory", async () => {
  const rootDirectory = await temporaryDirectory("move-project");
  try {
    const first = path.join(rootDirectory, "prima");
    const second = path.join(rootDirectory, "seconda Ω");
    await fsp.mkdir(first);
    const milkBytes = Buffer.from("[preset00]\nfRating=3.0\n", "utf8");
    const firstMilk = path.join(first, "visual.milk");
    await fsp.writeFile(firstMilk, milkBytes);
    const project = createDefaultProject();
    project.assets = [
      asset({
        id: "milk",
        type: "milkdrop-preset",
        path: firstMilk,
        originalPath: firstMilk,
        relativePath: "visual.milk",
        fileName: "visual.milk",
        size: milkBytes.length,
        hash: sha(milkBytes),
        status: "available",
        required: true
      })
    ];
    const firstProject = path.join(first, "progetto.avsproject");
    await saveProjectFile(firstProject, project);
    await fsp.rename(first, second);
    const movedProjectPath = path.join(second, "progetto.avsproject");
    const moved = await loadProjectFile(movedProjectPath);
    moved.assets[0].path = null;
    moved.assets[0].originalPath = null;
    moved.assets[0].status = "missing";
    const resolved = await new MediaRelinkService().resolveProject(
      moved,
      movedProjectPath
    );
    assert.equal(resolved.assets[0].status, "relinked");
    assert.equal(resolved.assets[0].path, path.join(second, "visual.milk"));
  } finally {
    await fsp.rm(rootDirectory, { recursive: true, force: true });
  }
});

test("relink multiplo esegue rollback logico completo su errore", () => {
  const project = createDefaultProject();
  project.assets = [
    asset(),
    asset({
      id: "cover",
      type: "cover",
      fileName: "cover.png",
      relativePath: "cover.png",
      required: false
    })
  ];
  const valid = {
    assetId: "project-audio",
    candidate: {
      path: "D:\\new\\audio.wav",
      fileName: "audio.wav",
      size: 100,
      hash: "a".repeat(64),
      supported: true
    },
    status: "relinked",
    requiresConfirmation: false,
    reason: "ok"
  };
  const invalid = {
    assetId: "cover",
    candidate: {
      path: "D:\\new\\payload.exe",
      fileName: "payload.exe",
      size: 10,
      hash: "b".repeat(64),
      supported: false
    },
    status: "unsupported",
    requiresConfirmation: false,
    reason: "tipo errato"
  };
  assert.throws(() => updateProjectAssets(project, [valid, invalid]), /tipo errato/i);
  assert.equal(project.audioFile, null);
  assert.equal(project.assets.every((item) => item.path === null), true);
});
