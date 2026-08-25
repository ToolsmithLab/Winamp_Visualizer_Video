"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = (...parts) =>
  fs.readFileSync(path.join(root, ...parts), "utf8");

function files(directory, extension = ".ts") {
  const absolute = path.join(root, directory);
  return fs
    .readdirSync(absolute, { recursive: true })
    .filter((entry) => String(entry).endsWith(extension))
    .map((entry) => path.join(absolute, String(entry)));
}

test("M5: T3.01-T3.13 risultano completate e T3.14 è il solo audit", () => {
  const tasks = source("PHASE_3_TASKS.md");
  assert.match(tasks, /T3\.01[–-]T3\.13 sono completate/);
  assert.match(tasks, /T3\.14\/M5 non è iniziata|T3\.14.*audit finale/s);
  for (let index = 1; index <= 14; index += 1) {
    assert.match(tasks, new RegExp(`T3\\.${String(index).padStart(2, "0")}`));
  }
});

test("M5: engine/shared non importano renderer, DOM, Electron o Node", () => {
  for (const file of [...files("src/engine"), ...files("src/shared")]) {
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(text, /from\s+["'][^"']*renderer/i, file);
    if (file.includes(`${path.sep}engine${path.sep}`)) {
      assert.doesNotMatch(
        text,
        /from\s+["'](?:electron|node:|fs|path|child_process)/,
        file
      );
      assert.doesNotMatch(
        text,
        /\bwindow\.|\bdocument\.(?:querySelector|getElementById|createElement|body)\b|\bHTMLElement\b/,
        file
      );
    }
  }
});

test("M5: preview ed export convergono sullo stesso SceneCompositor", () => {
  assert.match(
    source("src", "renderer", "previewRenderer.ts"),
    /SceneCompositor/
  );
  assert.match(
    source("src", "main", "export", "offlineSceneCompositor.ts"),
    /SceneCompositor/
  );
  assert.match(
    source("src", "main", "projectm", "projectMExportRenderer.ts"),
    /OfflineSceneCompositor/
  );
});

test("M5: projectM resta host separato e fuori dal registro Canvas", () => {
  const registry = require("../dist/engine/plugins/registry");
  assert.equal(registry.pluginRegistry.size, 10);
  assert.equal(registry.pluginRegistry.get("projectM"), undefined);
  assert.ok(
    fs.existsSync(path.join(root, "native", "bin", "win-x64", "projectm-host.exe"))
  );
  assert.match(
    source("src", "main", "projectm", "projectMHostService.ts"),
    /spawn\(/
  );
});

test("M5: registro unico alimenta host, inspector e validazione", () => {
  assert.match(
    source("src", "engine", "plugins", "visualizerHost.ts"),
    /pluginRegistry/
  );
  assert.match(
    source("src", "renderer", "inspector", "parameterControls.ts"),
    /pluginRegistry/
  );
  assert.match(
    source("src", "engine", "plugins", "registry.ts"),
    /validatePluginDescriptor/
  );
});

test("M5: i dieci plugin non usano random, clock, DOM, renderer o placeholder", () => {
  const pluginFiles = files("src/engine/plugins").filter(
    (file) =>
      !/types|registry|validation|visualizerHost|descriptorHelpers|pluginUtils/.test(
        path.basename(file)
      )
  );
  for (const file of pluginFiles) {
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      text,
      /Math\.random|Date\.now|performance\.now|\bdocument\s*\.|\bwindow\s*\.|mock|placeholder/i,
      file
    );
  }
});

test("M5: app mantiene i moduli estratti invece di duplicarne l'implementazione", () => {
  const app = source("src", "renderer", "app.ts");
  for (const moduleName of [
    "PreviewRenderer",
    "PluginParameterInspector",
    "ProjectPresetView",
    "AssetRelinkView",
    "historyController"
  ]) {
    assert.match(app, new RegExp(moduleName));
  }
  assert.doesNotMatch(app, /class\s+SceneCompositor|class\s+VisualizerHost/);
});

test("M5: schema progetto e formato preset hanno versioni distinte", () => {
  const project = require("../dist/shared/project");
  const preset = require("../dist/shared/projectPreset");
  assert.equal(project.PROJECT_VERSION, "6.0");
  assert.equal(preset.PROJECT_PRESET_VERSION, "1.0");
  assert.notEqual(project.PROJECT_VERSION, preset.PROJECT_PRESET_VERSION);
});

test("M5: IPC M4/M5 non espone primitive filesystem generiche", () => {
  const preload = source("src", "preload", "preload.ts");
  const sharedIpc = source("src", "shared", "ipc.ts");
  assert.doesNotMatch(
    `${preload}\n${sharedIpc}`,
    /\b(readFile|writeFile|readdir|unlink|exec|spawn|shellCommand)\b/
  );
  assert.match(sharedIpc, /projectPreset/);
  assert.match(sharedIpc, /asset/);
});

test("M5: pipeline import/relink non usa eval, Function, shell o import dinamico", () => {
  const text = [
    source("src", "shared", "projectPreset.ts"),
    source("src", "main", "project", "projectPresetService.ts"),
    source("src", "main", "project", "mediaRelinkService.ts"),
    source("src", "engine", "project", "assetResolver.ts")
  ].join("\n");
  assert.doesNotMatch(
    text,
    /\beval\s*\(|new\s+Function|Function\s*\(|import\s*\(|child_process|exec\s*\(|spawn\s*\(/
  );
});

test("M5: nessuna funzione Fase 4 dichiarata è presente nel codice", () => {
  const text = files("src")
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  for (const marker of [
    "sceneList",
    "customCurve",
    "beatDetection",
    "externalPluginLoader",
    "pluginMarketplace",
    "cloudSync",
    "collaborationSession",
    "advancedAutosave",
    "automaticUpdater"
  ]) {
    assert.doesNotMatch(text, new RegExp(marker, "i"));
  }
});

test("M5: packaging non include workspace, golden o librerie personali", () => {
  const pkg = JSON.parse(source("package.json"));
  assert.deepEqual(pkg.build.files.slice(0, 2), ["dist/**/*", "package.json"]);
  const packagedFiles = JSON.stringify(pkg.build.files);
  assert.doesNotMatch(
    packagedFiles,
    /test-results|tests\/|project-presets|preset-library/
  );
  assert.match(packagedFiles, /node_modules\/yauzl/);
  assert.match(packagedFiles, /node_modules\/fd-slicer/);
  const resources = JSON.stringify(pkg.build.extraResources);
  assert.doesNotMatch(resources, /test-results|tests\/|project-presets|preset-library/);
  assert.match(resources, /native\/bin\/win-x64/);
  assert.match(resources, /native\/ffmpeg\/win-x64/);
  assert.match(resources, /licenses/);
});

test("M5: tutti i documenti vincolanti e finali previsti sono individuati", () => {
  const required = [
    "PHASE_3_SCOPE.md",
    "PHASE_3_ARCHITECTURE.md",
    "PHASE_3_TASKS.md",
    "PHASE_3_TEST_PLAN.md",
    "PHASE_3_RISK_REGISTER.md",
    "PROJECT_SCHEMA_6.md",
    "COMMAND_HISTORY_ARCHITECTURE.md",
    "PLUGIN_HOST_ARCHITECTURE.md",
    "PLUGIN_CATALOG.md",
    "PLUGIN_PARAMETER_SCHEMA.md",
    "KEYFRAME_ARCHITECTURE.md",
    "TIMELINE_ARCHITECTURE.md",
    "TRANSFORM_AND_SNAPPING_ARCHITECTURE.md",
    "PROJECT_PRESET_FORMAT.md",
    "ASSET_RESOLVER_ARCHITECTURE.md",
    "MEDIA_RELINK_WORKFLOW.md"
  ];
  for (const name of required) {
    assert.ok(fs.existsSync(path.join(root, name)), name);
  }
});
