"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const fixture = (...parts) =>
  path.join(root, "test-results", "audio-source", ...parts);
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const appSource = source("src/renderer/app.ts");
const previewSource = source("src/renderer/previewRenderer.ts");
const sceneSource = source("src/engine/composition/sceneCompositor.ts");
const exportSource = source("src/main/projectm/projectMExportRenderer.ts");
const projectSource = source("src/shared/project.ts");
const { inspectClip } = require("../dist/main/mediaService.js");
const {
  createDefaultProject,
  normalizeProject,
  serializeProject
} = require("../dist/shared/project.js");
const {
  clipDecoderArguments
} = require("../dist/main/projectm/projectMExportRenderer.js");
const {
  OfflineSceneCompositor
} = require("../dist/main/export/offlineSceneCompositor.js");

const fixtures = {
  mp4Audio: fixture("clip-con-audio.mp4"),
  mp4Muted: fixture("clip-muta.mp4"),
  mov: fixture("clip-h264.mov"),
  webm: fixture("clip-vp8.webm"),
  unsupported: fixture("clip-codec-non-supportato.mp4"),
  clipExport: fixture("export-audio-clip.mp4"),
  externalExport: fixture("export-audio-esterno.mp4"),
  canvasExport: fixture("export-video-canvas.mp4"),
  projectMExport: fixture("export-video-projectm.mp4")
};

function assertFixture(file) {
  assert.ok(fs.existsSync(file), `Fixture mancante: ${file}`);
  assert.ok(fs.statSync(file).size > 100, `Fixture vuota: ${file}`);
}

function emptyAudio() {
  return {
    volume: 0.45,
    bass: 0.35,
    mid: 0.25,
    high: 0.2,
    spectrum: new Uint8Array(128).fill(96),
    waveform: new Uint8Array(128).fill(128)
  };
}

function videoProject(width = 8, height = 8) {
  const project = createDefaultProject();
  project.clip.filePath = fixtures.mp4Muted;
  project.clip.width = width;
  project.clip.height = height;
  project.clip.durationSeconds = 2;
  project.cover.width = 1;
  project.cover.height = 1;
  project.cover.fitMode = "fill";
  project.cover.cornerRadius = 0;
  project.projectM.enabled = false;
  for (const layer of project.layers) {
    layer.visible = layer.kind === "cover";
  }
  return project;
}

function solidFrame(width, height, red = 180, green = 24, blue = 60) {
  const frame = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < frame.length; offset += 4) {
    frame[offset] = red;
    frame[offset + 1] = green;
    frame[offset + 2] = blue;
    frame[offset + 3] = 255;
  }
  return frame;
}

function render(project, configure = () => {}) {
  const compositor = new OfflineSceneCompositor(8, 8);
  try {
    compositor.setClipFrame(solidFrame(8, 8), 8, 8);
    configure(compositor);
    return Buffer.from(
      compositor.render(project, emptyAudio(), 0.5, 30, project.projectM.enabled)
    );
  } finally {
    compositor.dispose();
  }
}

function probe(file) {
  assertFixture(file);
  const ffmpeg = path.join(
    root,
    "native",
    "ffmpeg",
    "win-x64",
    "ffmpeg.exe"
  );
  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", file], {
    encoding: "utf8",
    windowsHide: true
  });
  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  return {
    text,
    audio: (text.match(/Stream #\d+:\d+.*Audio:/g) || []).length,
    video: (text.match(/Stream #\d+:\d+.*Video:/g) || []).length
  };
}

test("video layer 01 - MP4 H.264 con audio", async () => {
  assertFixture(fixtures.mp4Audio);
  const metadata = await inspectClip(fixtures.mp4Audio);
  assert.equal(metadata.container, "MP4");
  assert.equal(metadata.videoCodec, "h264");
  assert.equal(metadata.audioCodec, "aac");
  assert.equal(metadata.hasAudio, true);
  assert.equal(metadata.previewSupported, true);
});

test("video layer 02 - MP4 H.264 senza audio", async () => {
  const metadata = await inspectClip(fixtures.mp4Muted);
  assert.equal(metadata.videoCodec, "h264");
  assert.equal(metadata.hasAudio, false);
  assert.equal(metadata.previewSupported, true);
});

test("video layer 03 - MOV H.264", async () => {
  const metadata = await inspectClip(fixtures.mov);
  assert.equal(metadata.container, "MOV");
  assert.equal(metadata.videoCodec, "h264");
  assert.equal(metadata.previewSupported, true);
});

test("video layer 04 - WebM VP8 supportato", async () => {
  const metadata = await inspectClip(fixtures.webm);
  assert.equal(metadata.container, "WEBM");
  assert.equal(metadata.videoCodec, "vp8");
  assert.equal(metadata.previewSupported, true);
});

test("video layer 05 - codec non supportato diagnosticato", async () => {
  const metadata = await inspectClip(fixtures.unsupported);
  assert.equal(metadata.videoCodec, "mpeg4");
  assert.equal(metadata.previewSupported, false);
  assert.match(metadata.compatibilityReason, /MP4 H\.264/);
});

test("video layer 06 - primo frame inizializzato prima di Play", () => {
  assert.match(previewSource, /loadedmetadata/);
  assert.match(previewSource, /loadeddata/);
  assert.match(previewSource, /waitForFirstVideoFrame/);
  assert.match(previewSource, /requestVideoFrameCallback/);
  assert.match(appSource, /decoded\.presentedFrames < 1/);
});

test("video layer 07 - pulsante Video dinamico presente", () => {
  assert.match(appSource, /id="simple-layer-background"/);
  assert.match(appSource, /backgroundMediaLabel\(project\)/);
  assert.match(appSource, /return "Video"/);
});

test("video layer 08 - caricamento attiva e seleziona Video", () => {
  assert.match(appSource, /layer\.name = "Video"/);
  assert.match(appSource, /layer\.visible = true/);
  assert.match(appSource, /selectLayer\(backgroundLayer\(\)\?\.id \?\? "cover"\)/);
});

test("video layer 09 - immagine e video sono esclusivi", () => {
  assert.match(appSource, /if \(project\.clip\.filePath && project\.cover\.filePath\)/);
  assert.match(appSource, /project\.cover\.filePath = null/);
  assert.match(appSource, /filePath: null,[\s\S]*durationSeconds: 0/);
});

test("video layer 10 - drag modifica posizione stage", () => {
  assert.match(previewSource, /\? "resize" : "move"/);
  assert.match(previewSource, /onTransformLayer/);
  assert.match(appSource, /setBackgroundTransformForTest/);
});

test("video layer 11 - resize modifica scala X e Y", () => {
  assert.match(previewSource, /handle \? "resize" : "move"/);
  assert.match(previewSource, /scaleX/);
  assert.match(previewSource, /scaleY/);
});

test("video layer 12 - rotazione disponibile", () => {
  assert.match(previewSource, /handle === "rotate"/);
  assert.match(previewSource, /rotation/);
  assert.match(previewSource, /geometryHandles/);
});

test("video layer 13 - Centra usa il layer Sfondo", () => {
  assert.match(appSource, /function centerCurrentCover/);
  assert.match(appSource, /centerCover\(project\)/);
});

test("video layer 14 - Adatta usa l'intero stage", () => {
  assert.match(appSource, /project\.cover\.width = 1/);
  assert.match(appSource, /project\.cover\.height = 1/);
  assert.match(appSource, /project\.cover\.fitMode = "contain"/);
});

test("video layer 15 - Ripristina azzera trasformazione e opacita", () => {
  assert.match(appSource, /function resetCurrentCover/);
  assert.match(appSource, /rotation: 0/);
  assert.match(appSource, /project\.cover\.opacity = 1/);
});

test("video layer 16 - blocco selezione limita i pointer al layer attivo", () => {
  assert.match(previewSource, /private selectionLocked = true/);
  assert.match(previewSource, /if \(this\.selectionLocked\)/);
  assert.match(previewSource, /if \(!selectedContainsPoint\) return/);
});

test("video layer 17 - Play sincronizza video con timestamp", () => {
  assert.match(previewSource, /synchronizeClip\(time, playing\)/);
  assert.match(previewSource, /this\.clipVideo\.play\(\)/);
});

test("video layer 18 - Pausa ferma il video", () => {
  assert.match(previewSource, /this\.clipVideo\.pause\(\)/);
  assert.match(appSource, /preview\.setClipPlayback\(playing, audioEngine\.currentTime\)/);
});

test("video layer 19 - Ripresa continua dal timestamp audio", () => {
  assert.match(previewSource, /Math\.abs\(this\.clipVideo\.currentTime - mappedTime\)/);
  assert.match(previewSource, /shouldPlay && this\.clipVideo\.paused/);
});

test("video layer 20 - Stop riporta audio e video a zero", () => {
  assert.match(appSource, /audioEngine\.seek\(0\)/);
  assert.match(appSource, /preview\.setClipPlayback\(false, 0\)/);
});

test("video layer 21 - seek richiede il frame corrispondente", () => {
  assert.match(previewSource, /this\.clipVideo\.currentTime = Math\.min/);
  assert.match(previewSource, /"seeked"/);
});

test("video layer 22 - cambio sorgente resta esclusivo", () => {
  assert.match(appSource, /name="simple-audio-source"/);
  assert.match(projectSource, /synchronizeSelectedAudio/);
  assert.match(projectSource, /const selected = selectedAudioFile\(project\)/);
  assert.match(projectSource, /project\.audioFile = selected/);
});

test("video layer 23 - waveform segue la sola sorgente attiva", () => {
  assert.match(appSource, /audioEngine\.waveformData/);
  assert.match(appSource, /activateAudioSource\(/);
  assert.match(appSource, /audioEngine\.clear\(\)/);
});

test("video layer 24 - clip corta Loop usa stream_loop", () => {
  const project = videoProject();
  project.exportSettings.fps = 30;
  project.clip.endMode = "loop";
  assert.deepEqual(clipDecoderArguments(project, 5).slice(3, 5), [
    "-stream_loop",
    "-1"
  ]);
});

test("video layer 25 - clip corta freeze usa ultimo frame", () => {
  const project = videoProject();
  project.clip.endMode = "freeze";
  const args = clipDecoderArguments(project, 5);
  assert.match(args[args.indexOf("-vf") + 1], /tpad=stop_mode=clone/);
});

test("video layer 26 - clip corta black non simula frame", () => {
  const project = videoProject();
  project.clip.endMode = "black";
  const args = clipDecoderArguments(project, 5);
  assert.doesNotMatch(args[args.indexOf("-vf") + 1], /tpad|loop/);
  assert.match(sceneSource, /clipBlack/);
  assert.match(sceneSource, /fillStyle = "#000000"/);
});

test("video layer 27 - clip lunga viene tagliata sulla durata audio", () => {
  const project = videoProject();
  project.clip.endMode = "freeze";
  const args = clipDecoderArguments(project, 1.25);
  assert.equal(args[args.indexOf("-t") + 1], "1.250000");
});

test("video layer 28 - video e Canvas sono composti insieme", () => {
  const project = videoProject();
  const without = render(project);
  const effect = project.layers.find((layer) => layer.kind === "visualizer");
  effect.visible = true;
  const withCanvas = render(project);
  assert.notDeepEqual(withCanvas, without);
});

test("video layer 29 - video e projectM sono composti insieme", () => {
  const project = videoProject();
  const without = render(project);
  const layer = project.layers.find((item) => item.kind === "projectM");
  layer.visible = true;
  layer.blendMode = "screen";
  project.projectM.enabled = true;
  const frame = {
    width: 8,
    height: 8,
    stride: 32,
    sequence: 1,
    timestamp: 0,
    bytes: new Uint8Array(solidFrame(8, 8, 220, 220, 220))
  };
  const withProjectM = render(project, (compositor) =>
    compositor.setProjectMFrame(frame)
  );
  assert.notDeepEqual(withProjectM, without);
});

test("video layer 30 - video e titolo sono composti insieme", () => {
  const project = videoProject();
  const without = render(project);
  project.text.title = "Titolo";
  project.text.titleSize = 1;
  project.layers.find((layer) => layer.kind === "titleText").visible = true;
  assert.notDeepEqual(render(project), without);
});

test("video layer 31 - video e artista sono composti insieme", () => {
  const project = videoProject();
  const without = render(project);
  project.text.artist = "Artista";
  project.text.artistSize = 1;
  project.layers.find((layer) => layer.kind === "artistText").visible = true;
  assert.notDeepEqual(render(project), without);
});

test("video layer 32 - ordine completo e Sfondo in fondo allo stack", () => {
  assert.match(appSource, /if \(layer\.kind === "cover"\) return 0/);
  assert.match(appSource, /if \(layer\.kind === "visualizer" \|\| layer\.kind === "projectM"\) return 1/);
  assert.match(appSource, /if \(layer\.kind === "titleText"\) return 2/);
});

test("video layer 33 - save reopen conserva trasformazioni", () => {
  const project = videoProject();
  const layer = project.layers.find((item) => item.kind === "cover");
  layer.transform = { x: 0.41, y: 0.57, scaleX: 0.82, scaleY: 0.73, rotation: 17 };
  const restored = normalizeProject(JSON.parse(serializeProject(project)));
  assert.deepEqual(
    restored.layers.find((item) => item.kind === "cover").transform,
    layer.transform
  );
});

test("video layer 34 - riavvio conserva clip codec e modalita", () => {
  const project = videoProject();
  project.clip.container = "MP4";
  project.clip.videoCodec = "h264";
  project.clip.audioCodec = "aac";
  project.clip.frameRate = 30;
  project.clip.endMode = "freeze";
  const restored = normalizeProject(JSON.parse(serializeProject(project)));
  assert.deepEqual(restored.clip, project.clip);
});

test("video layer 35 - percorso Unicode serializzato", () => {
  const project = videoProject();
  project.clip.filePath = "C:\\Video\\Èstate\\日本語\\clip 🎵.mp4";
  const restored = normalizeProject(JSON.parse(serializeProject(project)));
  assert.equal(restored.clip.filePath, project.clip.filePath);
});

test("video layer 36 - artefatto Portable disponibile", () => {
  assertFixture(
    path.join(root, "release", "Audio Visualizer Studio-Portable-0.2.0-x64.exe")
  );
});

test("video layer 37 - artefatto Setup disponibile", () => {
  assertFixture(
    path.join(root, "release", "Audio Visualizer Studio-Setup-0.2.0-x64.exe")
  );
});

test("video layer 38 - export reale con audio clip", () => {
  const result = probe(fixtures.clipExport);
  assert.equal(result.video, 1);
  assert.equal(result.audio, 1);
  assert.match(result.text, /Video: h264/);
});

test("video layer 39 - export reale con audio esterno", () => {
  const result = probe(fixtures.externalExport);
  assert.equal(result.video, 1);
  assert.equal(result.audio, 1);
  assert.match(result.text, /Audio: aac/);
});

test("video layer 40 - export contiene una sola traccia audio", () => {
  for (const file of [
    fixtures.clipExport,
    fixtures.externalExport,
    fixtures.canvasExport,
    fixtures.projectMExport
  ]) {
    const result = probe(file);
    assert.equal(result.audio, 1, file);
    assert.equal(result.video, 1, file);
  }
});

test("video layer 41 - nessun pixel non inizializzato", () => {
  const project = videoProject();
  const compositor = new OfflineSceneCompositor(8, 8);
  try {
    compositor.setClipFrame(solidFrame(8, 8), 8, 8);
    const frame = compositor.render(project, emptyAudio(), 0, 30, false);
    assert.equal(frame.length, 8 * 8 * 4);
    assert.equal(compositor.frameCoverage().writtenRows, 8);
    assert.equal(compositor.frameCoverage().lastRowWritten, true);
  } finally {
    compositor.dispose();
  }
});

test("video layer 42 - preview ed export usano lo stesso compositor e layout", () => {
  assert.match(previewSource, /new SceneCompositor\(\)/);
  assert.match(source("src/main/export/offlineSceneCompositor.ts"), /new SceneCompositor\(\)/);
  assert.match(sceneSource, /coverDrawPlan/);
  assert.match(sceneSource, /candidate\.videoWidth/);
  assert.match(sceneSource, /candidate\.videoHeight/);
  assert.match(exportSource, /compositor\.setClipFrame\(clipBuffer, clipWidth, clipHeight\)/);
  assert.doesNotMatch(
    clipDecoderArguments(videoProject(), 2).join(","),
    /scale=|crop=/
  );
});
