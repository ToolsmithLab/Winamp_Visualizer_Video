"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(
  path.join(root, "src", "renderer", "app.ts"),
  "utf8"
);
const previewSource = fs.readFileSync(
  path.join(root, "src", "renderer", "previewRenderer.ts"),
  "utf8"
);
const compositorSource = fs.readFileSync(
  path.join(root, "src", "engine", "composition", "sceneCompositor.ts"),
  "utf8"
);
const cssSource = fs.readFileSync(
  path.join(root, "src", "renderer", "styles.css"),
  "utf8"
);
const presetLibraryViewSource = fs.readFileSync(
  path.join(root, "src", "renderer", "presets", "presetLibraryView.ts"),
  "utf8"
);
const presetImportSource = fs.readFileSync(
  path.join(root, "src", "main", "presets", "presetImportService.ts"),
  "utf8"
);

const simpleControlIds = [
  "project-format-9-16",
  "project-format-1-1",
  "project-format-4-3",
  "project-format-16-9",
  "preview-zoom-fit",
  "preview-zoom-100",
  "preview-zoom-out",
  "preview-zoom-in",
  "simple-choose-cover",
  "simple-cover-fit",
  "simple-background-opacity",
  "simple-remove-cover",
  "simple-choose-clip",
  "simple-audio-source-clip",
  "simple-audio-source-external",
  "simple-choose-audio",
  "simple-clip-end-mode",
  "simple-title",
  "simple-title-size",
  "simple-title-color",
  "simple-title-opacity",
  "simple-artist",
  "simple-artist-size",
  "simple-artist-color",
  "simple-artist-opacity",
  "simple-effect",
  "simple-preset-button",
  "simple-preset-listbox",
  "simple-preset-search",
  "simple-preset-filter",
  "simple-preset-favorite",
  "simple-preset-delete",
  "simple-preset-add",
  "simple-preset-import-folder",
  "simple-preset-import-zip",
  "simple-preset-link-folder",
  "simple-intensity",
  "simple-effect-opacity",
  "simple-effect-center",
  "simple-effect-fit",
  "simple-effect-reset",
  "simple-effect-remove",
  "simple-layer-background",
  "simple-layer-effect",
  "simple-layer-title",
  "simple-layer-artist",
  "simple-layer-center",
  "simple-layer-fit",
  "simple-layer-reset",
  "simple-layer-selection-lock",
  "simple-stage-guides",
  "play-pause",
  "stop",
  "simple-seek",
  "simple-export-video",
  "simple-export-ratio",
  "simple-export-resolution",
  "simple-export-cancel",
  "simple-export-confirm",
  "preview",
  "waveform"
];

test("simple UI 01 - la schermata espone soltanto il flusso principale", () => {
  for (const heading of [
    "Sfondo",
    "Audio",
    "Titolo",
    "Artista",
    "Effetto"
  ]) {
    assert.match(appSource, new RegExp(`>${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`));
  }
  assert.match(appSource, /<aside class="simple-sidebar"/);
  assert.match(appSource, /<section class="stage">/);
});

test("simple UI 02 - pannelli tecnici precedenti sono esclusi dalla superficie visibile", () => {
  assert.match(appSource, /left-panel legacy-ui/);
  assert.match(appSource, /inspector legacy-ui/);
  assert.match(appSource, /timeline-panel legacy-ui/);
  assert.match(appSource, /top-actions legacy-ui/);
  assert.match(cssSource, /\.legacy-ui\s*\{\s*display:\s*none\s*!important/);
  assert.doesNotMatch(cssSource, /\.simple-sidebar[^}]*Avanzate/i);
});

test("simple UI 03 - il menu contiene i dieci Canvas, projectM e Nessun effetto", () => {
  const options = [
    "none",
    "spectrumBars",
    "circularSpectrum",
    "waveformLine",
    "particleBurst",
    "pulseShapes",
    "dynamicVignette",
    "radialRays",
    "mirroredWaveform",
    "audioGrid",
    "orbitingParticles",
    "projectM"
  ];
  for (const value of options) {
    assert.match(appSource, new RegExp(`<option value="${value}">`));
  }
});

test("simple UI 04 - sfondo supporta Adatta, Riempi e Dimensione originale", () => {
  const select = appSource.match(
    /<select id="simple-cover-fit">([\s\S]*?)<\/select>/
  )?.[1];
  assert.ok(select);
  assert.match(select, /value="contain">Adatta/);
  assert.match(select, /value="fill">Riempi/);
  assert.match(select, /value="original">Dimensione originale/);
  assert.doesNotMatch(select, /stretch|Stira/);
});

test("simple UI 05 - stato iniziale e blocco Play senza brano sono espliciti", () => {
  for (const message of [
    "1. Carica una cover o una clip video",
    "2. Carica il brano",
    "3. Scrivi titolo e artista",
    "4. Scegli un effetto",
    "5. Premi Play",
    "Carica prima un brano"
  ]) {
    assert.ok(appSource.includes(message));
  }
  assert.match(appSource, /id="play-pause"[\s\S]*?disabled>Play/);
});

test("simple UI 06 - tutti i 61 controlli interattivi sono registrati come collegati", () => {
  assert.equal(new Set(simpleControlIds).size, 61);
  for (const id of simpleControlIds) {
    assert.ok(appSource.includes(`id="${id}"`), `ID mancante: ${id}`);
  }
  assert.match(appSource, /const simpleControlsWithHandlers: HTMLElement\[\]/);
  assert.match(appSource, /control\.dataset\.handler = "connected"/);
  assert.match(appSource, /visibleWithoutHandler/);
});

test("simple UI 07 - la scelta effetto nasconde ogni effetto precedente", () => {
  assert.match(
    appSource,
    /if \(layer\.kind === "visualizer" \|\| layer\.kind === "projectM"\) \{\s*layer\.visible = false/
  );
  assert.match(appSource, /ensureSimpleVisualizerLayer\(project, effect\)/);
  assert.match(appSource, /project\.projectM\.enabled = effect === "projectM"/);
});

test("simple UI 08 - titolo e artista sono immediati e svuotandoli si nascondono", () => {
  assert.match(appSource, /bindSimpleText\(controls\.simpleTitle, "titleText"\)/);
  assert.match(appSource, /bindSimpleText\(controls\.simpleArtist, "artistText"\)/);
  assert.match(appSource, /layer\.visible = input\.value\.trim\(\)\.length > 0/);
  assert.match(appSource, /selectLayer\(layerId\)/);
});

test("simple UI 09 - immagine mantiene le proporzioni durante il resize", () => {
  assert.match(
    previewSource,
    /selected\.kind === "cover" \|\| event\.shiftKey/
  );
  assert.match(previewSource, /scaleX: uniformScale \?\? scaleX/);
  assert.match(previewSource, /scaleY: uniformScale \?\? scaleY/);
});

test("simple UI 10 - click sul vuoto deseleziona l'elemento", () => {
  assert.match(previewSource, /this\.selectedLayerId = ""/);
  assert.match(previewSource, /this\.onSelectLayer\(""\)/);
  assert.match(appSource, /if \(!layerId\) \{/);
});

test("simple UI 11 - intensità 0-200 raggiunge Canvas e projectM", () => {
  assert.match(
    appSource,
    /id="simple-intensity" type="range" min="0" max="200"/
  );
  assert.match(appSource, /layer\.reactive\.intensity = intensity/);
  assert.match(appSource, /updatePluginSetting\(layer, "intensity", intensity\)/);
  assert.match(compositorSource, /layer\.reactive\?\.intensity \?\? 1/);
  assert.match(compositorSource, /globalCompositeOperation = "screen"/);
});

test("simple UI 12 - progetto ed export mostrano quattro formati, risoluzione e 30 FPS fisso", () => {
  assert.match(appSource, /value="9:16">Verticale 9:16/);
  assert.match(appSource, /value="16:9">Orizzontale 16:9/);
  assert.match(appSource, /value="1:1">Quadrato 1:1/);
  assert.match(appSource, /value="4:3">Orizzontale 4:3/);
  for (const id of [
    "project-format-9-16",
    "project-format-1-1",
    "project-format-4-3",
    "project-format-16-9"
  ]) {
    assert.ok(appSource.includes(`id="${id}"`));
  }
  assert.match(appSource, /value="1080">Full HD/);
  assert.match(appSource, /value="720">HD/);
  assert.match(appSource, /<span>Frame rate<\/span><strong>30 FPS<\/strong>/);
  assert.match(appSource, /project\.exportSettings\.fps = 30/);
});

test("simple UI 13 - schema, IPC e protocollo projectM non sono stati versionati", () => {
  const projectSource = fs.readFileSync(
    path.join(root, "src", "shared", "project.ts"),
    "utf8"
  );
  const protocolSource = fs.readFileSync(
    path.join(root, "src", "main", "projectm", "projectMProtocol.ts"),
    "utf8"
  );
  assert.match(projectSource, /PROJECT_VERSION = "6\.0"/);
  assert.match(protocolSource, /PROJECTM_PROTOCOL_VERSION = 2/);
});

test("simple UI 14 - effetto espone solo controlli osservabili e trasformabili", () => {
  for (const id of [
    "simple-intensity",
    "simple-effect-opacity",
    "simple-effect-center",
    "simple-effect-fit",
    "simple-effect-reset",
    "simple-effect-remove"
  ]) {
    assert.ok(appSource.includes(`id="${id}"`));
  }
  assert.match(appSource, /updateSimpleEffectTransform/);
  assert.match(appSource, /chooseSimpleEffect\("none"\)/);
});

test("simple UI 15 - Preset MilkDrop è un combobox custom nel viewport", () => {
  assert.match(appSource, /role="combobox"/);
  assert.match(appSource, /role="listbox"/);
  assert.match(appSource, /positionSimplePresetListbox/);
  assert.match(cssSource, /\.simple-preset-listbox\s*\{[\s\S]*position:\s*fixed/);
  assert.match(cssSource, /max-height:\s*280px/);
  assert.match(cssSource, /overflow-y:\s*auto/);
});

test("simple UI 16 - la Libreria preset reale è accessibile senza limite artificiale", () => {
  for (const id of [
    "simple-preset-search",
    "simple-preset-count",
    "simple-preset-add",
    "simple-preset-import-folder",
    "simple-preset-import-zip",
    "simple-preset-link-folder"
  ]) {
    assert.ok(appSource.includes(`id="${id}"`), `Controllo libreria mancante: ${id}`);
  }
  assert.match(appSource, /Preset disponibili: \$\{valid\.length\}/);
  assert.match(appSource, /simplePresetCatalogRecords = records/);
  assert.match(appSource, /\.localeCompare\(right\.name, "it"/);
  assert.match(appSource, /presetLibraryView\.importPresets\(kind, mode, auditPaths\)/);
  assert.match(appSource, /importSimplePresets\("files", "copy"\)/);
  assert.match(appSource, /importSimplePresets\("folder", "copy"\)/);
  assert.match(appSource, /importSimplePresets\("zip", "copy"\)/);
  assert.match(appSource, /importSimplePresets\("folder", "link"\)/);
  assert.match(appSource, /report\.imported\.find\(/);
  assert.match(appSource, /presetLibraryView\.select\(firstValid\.id, "manual", true\)/);
  assert.doesNotMatch(appSource, /\.slice\(\s*0\s*,\s*6\s*\)/);
});

test("simple UI 17 - i pulsanti riusano importazione, catalogo e relink esistenti", () => {
  assert.match(
    presetLibraryViewSource,
    /window\.avs\.presetImport\(\{\s*kind,\s*mode,\s*auditPaths/
  );
  assert.match(presetLibraryViewSource, /await this\.refresh\(\)/);
  assert.match(presetImportSource, /this\.validateRuntime\(preset\.path\)/);
  assert.match(presetImportSource, /this\.library\.findByHash\(/);
  assert.match(
    presetImportSource,
    /await this\.library\.relink\(duplicate\.id, preset\.path\)/
  );
  assert.match(presetImportSource, /extractZipSecure\(zipPath, operationRoot\)/);
});

test("simple UI 18 - preferiti, filtro ed eliminazione usano la libreria persistente", () => {
  for (const id of [
    "simple-preset-filter",
    "simple-preset-favorite",
    "simple-preset-delete",
    "simple-preset-selected"
  ]) {
    assert.ok(appSource.includes(`id="${id}"`), `Gestione preset mancante: ${id}`);
  }
  assert.match(appSource, /value="favorites">Preferiti/);
  assert.match(appSource, /value="current-folder">Cartella corrente/);
  assert.match(appSource, /window\.avs\.presetFavorite\(preset\.id, !preset\.favorite\)/);
  assert.match(appSource, /window\.avs\.presetDelete\(preset\.id\)/);
  assert.match(appSource, /Il file esterno resterà sul disco/);
  assert.match(appSource, /await presetLibraryView\.select\(next\.id, "manual", true\)/);
});

test("simple UI 19 - pannello seleziona separatamente sfondo, effetto, titolo e artista", () => {
  assert.match(
    appSource,
    /id="simple-layer-background"[\s\S]*?id="simple-layer-background-label">Sfondo<\/strong>/
  );
  for (const [id, label] of [
    ["simple-layer-effect", "Effetto"],
    ["simple-layer-title", "Titolo"],
    ["simple-layer-artist", "Artista"]
  ]) {
    assert.match(
      appSource,
      new RegExp(`id="${id}"[\\s\\S]*?<strong>${label}</strong>`)
    );
  }
  assert.match(appSource, /simpleLayerByKind\(kind\)/);
  assert.match(appSource, /selectLayer\(layer\.id\)/);
  assert.match(appSource, /syncSimpleLayerSelector\(project\)/);
  assert.match(previewSource, /private selectionLocked = true/);
  assert.match(previewSource, /if \(this\.selectionLocked\)/);
  assert.match(previewSource, /if \(!selectedContainsPoint\) return/);
  assert.match(appSource, /Blocca selezione sul layer attivo/);
  assert.match(appSource, /Centra layer selezionato/);
  assert.match(appSource, /Adatta layer selezionato/);
  assert.match(appSource, /Ripristina layer selezionato/);
});
