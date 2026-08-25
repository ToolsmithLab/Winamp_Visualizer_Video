"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const service = read("src", "main", "exportService.ts");
const renderer = read(
  "src",
  "main",
  "projectm",
  "projectMExportRenderer.ts"
);
const host = read("src", "main", "projectm", "projectMHostService.ts");
const app = read("src", "renderer", "app.ts");
const shared = read("src", "shared", "ipc.ts");

test("export stall 01 - progresso IPC contiene fase, frame, velocità ed ETA", () => {
  for (const field of [
    "phase?",
    "frameCurrent?",
    "frameTotal?",
    "elapsedSeconds?",
    "framesPerSecond?",
    "estimatedRemainingSeconds?"
  ]) {
    assert.ok(shared.includes(field), `Campo progresso mancante: ${field}`);
  }
    assert.match(renderer, /status\?\.\(\{[\s\S]*?phase: "encoding"/);
  assert.match(service, /15 \+ \(update\.frameCurrent \/ frameTotal\) \* 82/);
});

test("export stall 02 - tutte le fasi richieste sono esplicite", () => {
  for (const label of [
    "Preparazione progetto",
    "Caricamento audio",
    "Avvio motore effetti",
    "Composizione frame",
    "Codifica video",
    "Finalizzazione file"
  ]) {
    assert.ok(`${service}\n${app}`.includes(label), `Fase mancante: ${label}`);
  }
});

test("export stall 03 - timeout distinti coprono l'intera prima frame pipeline", () => {
  for (const timeout of [
    "projectMInitializeMs",
    "presetLoadMs",
    "renderIpcMs",
    "firstFramebufferMs",
    "ffmpegStartMs",
    "firstAudioFrameMs",
    "firstFrameWriteMs",
    "outputOpenMs"
  ]) {
    assert.match(renderer, new RegExp(`${timeout}:\\s*\\d`));
  }
  assert.match(renderer, /withTimeout\(/);
});

test("export stall 04 - projectM viene inizializzato e il preset caricato separatamente", () => {
  assert.match(host, /loadInitialPreset = true/);
  assert.match(renderer, /host\.initialize\(width, height, project\.projectM\.randomSeed, false\)/);
  assert.match(renderer, /host\.loadPreset\(initialPreset\.path\)/);
  assert.match(renderer, /host\.diagnostics\.pendingRequestIds/);
});

test("export stall 05 - framebuffer è validato prima del compositing", () => {
  assert.match(renderer, /projectMFrame\.width !== width/);
  assert.match(renderer, /projectMFrame\.stride !== width \* 4/);
  assert.match(renderer, /projectMFrame\.bytes\.byteLength !== width \* height \* 4/);
});

test("export stall 06 - codec e percorsi runtime sono verificati e mostrati", () => {
  assert.match(service, /\\blibopenh264\\b/);
  assert.match(service, /Encoder audio AAC non disponibile/);
  assert.match(service, /openH264Path/);
  assert.match(app, /H\.264 OpenH264 \+ AAC/);
  assert.match(app, /export-runtime-paths/);
});

test("export stall 07 - log JSONL registra timestamp, fase e tempo trascorso", () => {
  assert.match(service, /class ExportDiagnosticLog/);
  assert.match(service, /timestamp: new Date\(\)\.toISOString\(\)/);
  assert.match(service, /elapsedMs:/);
  assert.match(service, /appendFile\(this\.path/);
  assert.doesNotMatch(service, /console\.(?:info|log)\("\[export\]"/);
});

test("export stall 08 - annullamento interrompe decoder, encoder e host", () => {
  assert.match(service, /job\.controller\.abort\(\)/);
  assert.match(service, /job\.runtime\.decoder\.kill\(\)/);
  assert.match(service, /job\.runtime\.encoder\.kill\(\)/);
  assert.match(service, /host\?\.terminate\("Esportazione annullata/);
  assert.match(service, /await removePartialOutput\(job\.destination\)/);
});

test("export stall 09 - UI mostra diagnostica e chiude il modal dopo Annulla", () => {
  for (const id of [
    "export-phase",
    "export-frame-count",
    "export-elapsed",
    "export-speed",
    "export-eta",
    "export-codecs",
    "export-output-path",
    "export-runtime-paths",
    "export-log-path"
  ]) {
    assert.ok(app.includes(`id="${id}"`), `Elemento UI mancante: ${id}`);
  }
  assert.match(app, /controls\.exportModal\.classList\.add\("hidden"\)/);
});

test("export stall 10 - nessun effetto evita projectM senza sostituti visuali", () => {
  assert.match(renderer, /Motore effetti disattivato · export senza projectM/);
  assert.match(renderer, /const useProjectM = Boolean/);
  assert.doesNotMatch(service, /showfreqs|showwaves|filter_complex/);
});
