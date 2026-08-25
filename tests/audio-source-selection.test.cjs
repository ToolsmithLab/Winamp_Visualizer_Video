"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const {
  createDefaultProject,
  normalizeProject,
  selectedAudioFile,
  synchronizeSelectedAudio
} = require("../dist/shared/project.js");
const {
  clipDecoderArguments
} = require("../dist/main/projectm/projectMExportRenderer.js");
const { encoderArguments } = require("../dist/main/exportService.js");
const {
  inspectClip,
  decodeClipAudio
} = require("../dist/main/mediaService.js");
const {
  OfflineSceneCompositor
} = require("../dist/main/export/offlineSceneCompositor.js");
const { emptyAudioSnapshot } = require("../dist/shared/audioAnalysis.js");

const appSource = fs.readFileSync(
  path.join(root, "src", "renderer", "app.ts"),
  "utf8"
);
const audioEngineSource = fs.readFileSync(
  path.join(root, "src", "renderer", "audioEngine.ts"),
  "utf8"
);
const exportSource = fs.readFileSync(
  path.join(root, "src", "main", "exportService.ts"),
  "utf8"
);
const ffmpeg = path.join(root, "native", "ffmpeg", "win-x64", "ffmpeg.exe");
const mediaDirectory = path.join(root, "test-results", "audio-source");
const clipAudioPath = path.join(mediaDirectory, "clip-con-audio.mp4");
const clipMutedPath = path.join(mediaDirectory, "clip-muta.mp4");
const externalAudioPath = path.join(mediaDirectory, "audio-esterno.wav");

function ensureFixtures() {
  fs.mkdirSync(mediaDirectory, { recursive: true });
  const commands = [
    [
      clipAudioPath,
      [
        "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=3",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3",
        "-c:v", "libopenh264", "-b:v", "600k", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-shortest"
      ]
    ],
    [
      clipMutedPath,
      [
        "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=2",
        "-c:v", "libopenh264", "-b:v", "600k", "-pix_fmt", "yuv420p", "-an"
      ]
    ],
    [
      externalAudioPath,
      [
        "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=5",
        "-c:a", "pcm_s16le"
      ]
    ]
  ];
  for (const [output, args] of commands) {
    if (fs.existsSync(output)) continue;
    const result = spawnSync(
      ffmpeg,
      ["-hide_banner", "-loglevel", "error", "-y", ...args, output],
      { encoding: "utf8", windowsHide: true }
    );
    assert.equal(result.status, 0, result.stderr);
  }
}

function outputStreamCounts(output) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", output], {
    encoding: "utf8",
    windowsHide: true
  });
  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  return {
    audio: (
      text.match(
        /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: Audio:/g
      ) || []
    ).length,
    video: (
      text.match(
        /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: Video:/g
      ) || []
    ).length
  };
}

test("audio source 01 - progetto nuovo usa una sola sorgente esterna", () => {
  const project = createDefaultProject();
  assert.equal(project.audioSource, "external");
  assert.equal(project.externalAudioFile, null);
  assert.equal(project.audioFile, null);
  assert.equal(project.clip.filePath, null);
});

test("audio source 02 - audio clip e audio esterno restano memorizzati separatamente", () => {
  const project = createDefaultProject();
  project.externalAudioFile = "C:\\media\\esterno.wav";
  project.clip = {
    filePath: "C:\\media\\clip.mp4",
    durationSeconds: 12,
    audioDurationSeconds: 12,
    hasAudio: true,
    width: 1920,
    height: 1080,
    endMode: "freeze"
  };
  project.audioSource = "clip";
  assert.equal(synchronizeSelectedAudio(project), project.clip.filePath);
  assert.equal(project.externalAudioFile, "C:\\media\\esterno.wav");
  project.audioSource = "external";
  assert.equal(synchronizeSelectedAudio(project), project.externalAudioFile);
  assert.equal(project.clip.filePath, "C:\\media\\clip.mp4");
});

test("audio source 03 - clip muta torna su audio esterno e non usa il file video come audio", () => {
  const project = createDefaultProject();
  project.externalAudioFile = "C:\\media\\esterno.mp3";
  project.clip.filePath = "C:\\media\\muta.mp4";
  project.clip.hasAudio = false;
  project.audioSource = "clip";
  synchronizeSelectedAudio(project);
  assert.equal(project.audioSource, "external");
  assert.equal(project.audioFile, project.externalAudioFile);
});

test("audio source 04 - save/reopen conserva sorgente, durate e modalità fine clip", () => {
  const raw = createDefaultProject();
  raw.externalAudioFile = "C:\\media\\esterno.wav";
  raw.externalAudioDurationSeconds = 31.5;
  raw.clip = {
    filePath: "C:\\media\\clip.webm",
    durationSeconds: 8.25,
    audioDurationSeconds: 8.25,
    hasAudio: true,
    width: 1280,
    height: 720,
    endMode: "loop"
  };
  raw.audioSource = "clip";
  raw.audioFile = raw.clip.filePath;
  const reopened = normalizeProject(JSON.parse(JSON.stringify(raw)));
  assert.equal(reopened.audioSource, "clip");
  assert.equal(reopened.audioFile, raw.clip.filePath);
  assert.equal(reopened.externalAudioFile, raw.externalAudioFile);
  assert.equal(reopened.externalAudioDurationSeconds, 31.5);
  assert.equal(reopened.clip.endMode, "loop");
});

test("audio source 05 - cento cambi non creano una seconda traccia logica", () => {
  const project = createDefaultProject();
  project.externalAudioFile = "C:\\media\\esterno.wav";
  project.clip.filePath = "C:\\media\\clip.mp4";
  project.clip.hasAudio = true;
  for (let index = 0; index < 100; index += 1) {
    project.audioSource = index % 2 ? "external" : "clip";
    synchronizeSelectedAudio(project);
    assert.equal(project.audioFile, selectedAudioFile(project));
  }
});

test("audio source 06 - UI espone radio esclusivi, stato, clip e scelta audio", () => {
  assert.match(appSource, /<h2 id="simple-audio-heading">Audio<\/h2>/);
  assert.match(appSource, /<h2 id="simple-image-heading">Sfondo<\/h2>/);
  assert.match(appSource, /name="simple-audio-source"[\s\S]*value="clip"/);
  assert.match(appSource, /name="simple-audio-source"[\s\S]*value="external"/);
  assert.match(appSource, />Usa audio della clip</);
  assert.match(appSource, />Usa audio esterno</);
  assert.match(appSource, /id="simple-audio-source-status"/);
  assert.match(
    appSource,
    /id="simple-choose-clip"[\s\S]*?Carica clip video[\s\S]*?MP4, MOV, M4V o WEBM \(codec compatibile\)/
  );
  assert.ok(
    appSource.indexOf('id="simple-choose-clip"') <
      appSource.indexOf('id="simple-audio-heading"')
  );
  assert.match(appSource, /id="simple-choose-audio"/);
});

test("audio source 07 - un solo Audio element alimenta trasporto e waveform", () => {
  assert.equal(
    (audioEngineSource.match(/readonly element = new Audio\(\)/g) ?? []).length,
    1
  );
  assert.match(audioEngineSource, /clear\(\): void/);
  assert.match(appSource, /audioEngine\.waveformData/);
  assert.match(appSource, /activateAudioSource\(/);
  assert.match(appSource, /stopPlayback\(\);[\s\S]*draft\.audioSource = source/);
});

test("audio source 08 - export mappa una sola traccia audio attiva", () => {
  const project = createDefaultProject();
  project.audioFile = "C:\\media\\attivo.wav";
  const args = encoderArguments(project, "C:\\out\\video.mp4");
  assert.equal(args.filter((value) => value === project.audioFile).length, 1);
  assert.equal(args.filter((value) => value === "1:a:0").length, 1);
  assert.equal(args.filter((value) => value === "-map").length, 2);
  assert.match(exportSource, /"-map",\s*"1:a:0"/);
});

test("audio source 09 - decoder clip disattiva audio e applica loop/freeze/black", () => {
  const project = createDefaultProject();
  project.clip.filePath = "C:\\media\\clip.mp4";
  project.clip.hasAudio = true;
  project.exportSettings.width = 1080;
  project.exportSettings.height = 1920;
  project.exportSettings.fps = 30;

  project.clip.endMode = "loop";
  let args = clipDecoderArguments(project, 10);
  assert.deepEqual(args.slice(3, 5), ["-stream_loop", "-1"]);
  assert.ok(args.includes("-an"));
  assert.match(args[args.indexOf("-vf") + 1], /fps=30/);
  assert.doesNotMatch(args[args.indexOf("-vf") + 1], /scale|crop/);

  project.clip.endMode = "freeze";
  args = clipDecoderArguments(project, 10);
  assert.match(args[args.indexOf("-vf") + 1], /tpad=stop_mode=clone/);

  project.clip.endMode = "black";
  args = clipDecoderArguments(project, 10);
  assert.doesNotMatch(args[args.indexOf("-vf") + 1], /tpad|loop/);
});

test("audio source 10 - compositor offline usa la clip nel layer Sfondo", () => {
  const project = createDefaultProject();
  project.clip.filePath = "C:\\media\\clip.mp4";
  project.cover.width = 1;
  project.cover.height = 1;
  project.cover.fitMode = "fill";
  project.cover.cornerRadius = 0;
  project.layers.forEach((layer) => {
    layer.visible = layer.kind === "cover";
  });
  const compositor = new OfflineSceneCompositor(4, 4);
  try {
    const clip = Buffer.alloc(4 * 4 * 4);
    for (let offset = 0; offset < clip.length; offset += 4) {
      clip[offset] = 220;
      clip[offset + 3] = 255;
    }
    compositor.setClipFrame(clip, 4, 4);
    const frame = compositor.render(
      project,
      emptyAudioSnapshot(),
      0,
      30,
      false
    );
    assert.equal(frame.length, 4 * 4 * 4);
    const center = (2 * 4 + 2) * 4;
    assert.ok(frame[center] > 180);
    assert.equal(compositor.frameCoverage().writtenRows, 4);
    assert.equal(compositor.frameCoverage().lastRowWritten, true);
  } finally {
    compositor.dispose();
  }
});

test("audio source 11 - messaggio clip muta e sincronizzazione preview sono espliciti", () => {
  assert.match(appSource, /La clip non contiene una traccia audio/);
  assert.match(appSource, /preview\.setClipPlayback\(playing, audioEngine\.currentTime\)/);
  assert.match(appSource, /readClipAudio\(path\)/);
});

test("audio source 12 - ispezione reale distingue clip con audio e clip muta", async () => {
  ensureFixtures();
  const withAudio = await inspectClip(clipAudioPath);
  const muted = await inspectClip(clipMutedPath);
  assert.equal(withAudio.hasVideo, true);
  assert.equal(withAudio.hasAudio, true);
  assert.equal(withAudio.width, 320);
  assert.equal(withAudio.height, 180);
  assert.equal(muted.hasVideo, true);
  assert.equal(muted.hasAudio, false);
});

test("audio source 13 - decodifica reale produce WAV PCM e rifiuta clip muta", async () => {
  ensureFixtures();
  const decoded = await decodeClipAudio(clipAudioPath);
  assert.equal(decoded.mimeType, "audio/wav");
  assert.equal(Buffer.from(decoded.bytes.subarray(0, 4)).toString("ascii"), "RIFF");
  await assert.rejects(
    () => decodeClipAudio(clipMutedPath),
    /La clip non contiene una traccia audio/
  );
});

test("audio source 14 - export reale con audio clip contiene un solo stream audio", {
  timeout: 90_000
}, async () => {
  ensureFixtures();
  const {
    renderProjectMExport
  } = require("../dist/main/projectm/projectMExportRenderer.js");
  const output = path.join(mediaDirectory, "unit-export-clip.mp4");
  fs.rmSync(output, { force: true });
  const project = createDefaultProject();
  project.clip = {
    filePath: clipAudioPath,
    durationSeconds: 3,
    audioDurationSeconds: 3,
    hasAudio: true,
    width: 320,
    height: 180,
    endMode: "freeze"
  };
  project.audioSource = "clip";
  project.audioFile = clipAudioPath;
  project.projectM.enabled = false;
  project.layers.forEach((layer) => {
    layer.visible = false;
  });
  project.exportSettings.width = 320;
  project.exportSettings.height = 180;
  project.exportSettings.fps = 30;
  let reportedFrameTotal = 0;
  const runtime = await renderProjectMExport(
    null,
    ffmpeg,
    encoderArguments(project, output),
    project,
    [],
    {
      progress() {},
      warning() {},
      status(update) {
        reportedFrameTotal = update.frameTotal || reportedFrameTotal;
      }
    },
    { durationSeconds: 3, outputPath: output }
  );
  const metrics = await runtime.completion;
  assert.equal(
    metrics.frames,
    90,
    JSON.stringify({ reportedFrameTotal, fps: metrics.fps, duration: metrics.durationSeconds })
  );
  assert.deepEqual(outputStreamCounts(output), { audio: 1, video: 1 });
});

test("audio source 15 - export reale con audio esterno e clip corta mantiene un solo audio", {
  timeout: 90_000
}, async () => {
  ensureFixtures();
  const {
    renderProjectMExport
  } = require("../dist/main/projectm/projectMExportRenderer.js");
  const output = path.join(mediaDirectory, "unit-export-esterno.mp4");
  fs.rmSync(output, { force: true });
  const project = createDefaultProject();
  project.clip = {
    filePath: clipAudioPath,
    durationSeconds: 3,
    audioDurationSeconds: 3,
    hasAudio: true,
    width: 320,
    height: 180,
    endMode: "freeze"
  };
  project.externalAudioFile = externalAudioPath;
  project.externalAudioDurationSeconds = 5;
  project.audioSource = "external";
  project.audioFile = externalAudioPath;
  project.projectM.enabled = false;
  project.layers.forEach((layer) => {
    layer.visible = false;
  });
  project.exportSettings.width = 320;
  project.exportSettings.height = 180;
  project.exportSettings.fps = 30;
  const runtime = await renderProjectMExport(
    null,
    ffmpeg,
    encoderArguments(project, output),
    project,
    [],
    { progress() {}, warning() {} },
    { durationSeconds: 5, outputPath: output }
  );
  const metrics = await runtime.completion;
  assert.equal(metrics.frames, 150);
  assert.deepEqual(outputStreamCounts(output), { audio: 1, video: 1 });
});

test("audio source 16 - selettore esterno accetta WAV e MP3", () => {
  const ipcSource = fs.readFileSync(
    path.join(root, "src", "main", "ipc.ts"),
    "utf8"
  );
  assert.match(
    ipcSource,
    /Audio supportato", extensions: \["mp3", "wav"\]/
  );
});

test("audio source 17 - seek, pausa, Stop e fine brano riallineano la clip", () => {
  assert.match(appSource, /simpleSeek\.addEventListener[\s\S]*setClipPlayback/);
  assert.match(appSource, /function stopPlayback[\s\S]*setClipPlayback\(false, 0\)/);
  assert.match(appSource, /element\.addEventListener\("ended"[\s\S]*setClipPlayback/);
});

test("audio source 18 - salvataggio e riapertura ricaricano clip e audio selezionato", () => {
  assert.match(appSource, /restoredProject\.clip\.filePath[\s\S]*await loadClip/);
  assert.match(
    appSource,
    /await loadAudio\([\s\S]*restoredProject\.audioSource/
  );
  assert.match(appSource, /synchronizeSelectedAudio/);
});
