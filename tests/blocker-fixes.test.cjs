"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const {
  createDefaultProject,
  normalizeProject
} = require("../dist/shared/project");
const {
  buildPresetSequence
} = require("../dist/shared/presetSequencer");
const {
  createInputPacket,
  encodeProjectMUtf8
} = require("../dist/main/projectm/projectMProtocol");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");
const {
  PresetImportService
} = require("../dist/main/presets/presetImportService");
const {
  PresetLibraryService
} = require("../dist/main/presets/presetLibraryService");
const {
  renderProjectMExport
} = require("../dist/main/projectm/projectMExportRenderer");

const root = path.resolve(__dirname, "..");
const hostPath = path.join(root, "native", "bin", "win-x64", "projectm-host.exe");
const libraryPath = path.join(root, "native", "bin", "win-x64", "projectM-4.dll");
const ffmpegPath = path.join(
  root,
  "native",
  "ffmpeg",
  "win-x64",
  "ffmpeg.exe"
);
const bundledPath = path.join(
  root,
  "assets",
  "projectm",
  "presets",
  "AVS Audio Wave.milk"
);
const nativeAvailable =
  process.platform === "win32" &&
  fsSync.existsSync(hostPath) &&
  fsSync.existsSync(libraryPath) &&
  fsSync.existsSync(ffmpegPath);

function presetRecord(id, name, presetPath) {
  return {
    id,
    name,
    author: null,
    path: presetPath,
    origin: { kind: "linked", sourcePath: presetPath, label: "Audit Unicode" },
    importedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    hash: id,
    status: "valid",
    license: "Licenza non verificata",
    licenseVerified: false,
    textures: [],
    missingTextures: [],
    compatibility: "projectM-4.1.6",
    favorite: false,
    quarantined: false,
    quarantineReason: "",
    errorReport: [],
    thumbnailPath: null
  };
}

function configuredProject() {
  const project = createDefaultProject();
  project.projectM.playlistIds = ["a", "b", "c", "d", "e"];
  project.projectM.sequenceStartPresetId = "b";
  project.projectM.presetId = "d";
  project.projectM.randomSeed = 0x5a17c0de;
  project.projectM.manualRandomCounter = 9;
  project.projectM.autoSwitch.enabled = true;
  project.projectM.autoSwitch.mode = "interval";
  project.projectM.autoSwitch.order = "random";
  project.projectM.autoSwitch.minimumSeconds = 7;
  project.projectM.autoSwitch.maximumSeconds = 13;
  project.projectM.autoSwitch.intervalSeconds = 9;
  project.projectM.autoSwitch.noImmediateRepeat = true;
  project.projectM.transition = { enabled: true, durationSeconds: 1.75 };
  project.projectM.history = [
    { presetId: "c", at: 24.25, source: "manual" },
    { presetId: "d", at: 87.5, source: "automatic" }
  ];
  project.projectM.markers = [
    {
      id: "marker-one",
      time: 120,
      label: "Primo",
      source: "timeline",
      presetId: "e"
    },
    {
      id: "marker-two",
      time: 360,
      label: "Secondo",
      source: "music",
      presetId: null
    }
  ];
  return project;
}

function enrichedEvents(project, duration = 600) {
  const settings = project.projectM;
  return buildPresetSequence(
    settings,
    settings.playlistIds,
    duration
  ).map((event) => ({
    ...event,
    order: settings.autoSwitch.order,
    transitionEnabled: settings.transition.enabled,
    transitionDurationSeconds: settings.transition.durationSeconds,
    marker:
      settings.markers.find(
        (marker) =>
          Math.abs(marker.time - event.time) < 1e-9 &&
          (marker.presetId === null || marker.presetId === event.presetId)
      ) ?? null,
    playlistIndex: settings.playlistIds.indexOf(event.presetId)
  }));
}

function assertRoundTrip(project) {
  const beforeProject = structuredClone(project);
  const beforeEvents = enrichedEvents(beforeProject);
  const restored = normalizeProject(JSON.parse(JSON.stringify(beforeProject)));
  const afterEvents = enrichedEvents(restored);
  assert.deepEqual(afterEvents, beforeEvents);
  assert.equal(restored.projectM.randomSeed, beforeProject.projectM.randomSeed);
  assert.equal(
    restored.projectM.sequenceStartPresetId,
    beforeProject.projectM.sequenceStartPresetId
  );
  assert.deepEqual(restored.projectM.playlistIds, beforeProject.projectM.playlistIds);
  assert.deepEqual(restored.projectM.history, beforeProject.projectM.history);
  assert.deepEqual(restored.projectM.markers, beforeProject.projectM.markers);
  assert.deepEqual(restored.projectM.transition, beforeProject.projectM.transition);
}

const restoreScenarios = {
  "ordine sequenziale": (project) => {
    project.projectM.autoSwitch.order = "sequential";
    project.projectM.autoSwitch.minimumSeconds = 6;
    project.projectM.autoSwitch.maximumSeconds = 6;
    project.projectM.autoSwitch.intervalSeconds = 6;
  },
  "ordine casuale": () => {},
  "playlist modificata": (project) => {
    project.projectM.playlistIds = ["e", "c", "a", "d"];
    project.projectM.sequenceStartPresetId = "c";
  },
  "preset iniziale diverso dal corrente": (project) => {
    project.projectM.sequenceStartPresetId = "a";
    project.projectM.presetId = "e";
  },
  "salvataggio dopo selezione manuale": (project) => {
    project.projectM.presetId = "c";
    project.projectM.sequenceStartPresetId = "b";
    project.projectM.history.push({
      presetId: "c",
      at: 222.125,
      source: "manual"
    });
  },
  "salvataggio durante una transizione": (project) => {
    project.projectM.transition = { enabled: true, durationSeconds: 2.5 };
    project.projectM.history.push({
      presetId: "e",
      at: 299.999,
      source: "automatic"
    });
  },
  "salvataggio dopo seek": (project) => {
    project.projectM.history.push({
      presetId: "a",
      at: 510.75,
      source: "timeline-marker"
    });
    project.projectM.markers.push({
      id: "seek-marker",
      time: 510.75,
      label: "Dopo seek",
      source: "timeline",
      presetId: "a"
    });
  },
  "salvataggio con lock attivo": (project) => {
    project.projectM.locked = true;
  }
};

for (const [name, configure] of Object.entries(restoreScenarios)) {
  test(`restore atomico preserva 600 secondi evento per evento: ${name}`, () => {
    const project = configuredProject();
    configure(project);
    assertRoundTrip(project);
  });
}

test("protocollo projectM misura la lunghezza in byte UTF-8", () => {
  const value = "C:\\Preset\\Ω 日本語 emoji 🚀\\Visualità.milk";
  const payload = encodeProjectMUtf8(value, "percorso preset");
  const [header, body] = createInputPacket(
    3,
    7,
    payload
  );
  assert.equal(header.readUInt32LE(12), Buffer.byteLength(value, "utf8"));
  assert.equal(body.toString("utf8"), value);
  assert.ok(Buffer.byteLength(value, "utf8") > value.length);
});

test("protocollo projectM rifiuta surrogati UTF-16 non accoppiati", () => {
  assert.throws(
    () => encodeProjectMUtf8("C:\\Preset\\\ud800\\bad.milk"),
    /surrogato UTF-16 alto non accoppiato/
  );
  assert.throws(
    () => encodeProjectMUtf8("C:\\Preset\\\udc00\\bad.milk"),
    /surrogato UTF-16 basso non accoppiato/
  );
});

test(
  "percorsi Unicode attraversano import, link, persistenza, relink e host reale",
  { timeout: 180_000, skip: nativeAvailable ? false : "Runtime projectM non disponibile" },
  async (t) => {
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "AVS_Unicode_Blocker_")
    );
    t.after(async () => {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    });
    const labels = [
      "Ω",
      "è à ò ù ì",
      "ä ö ü ß",
      "é ç œ",
      "ą ć ę ł ń",
      "Кириллица",
      "Ελληνικά",
      "日本語",
      "中文",
      "emoji 🚀",
      "spazi (parentesi) l'apostrofo-trattini",
      "NFC-é",
      "NFD-e\u0301"
    ];
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlK7ZkAAAAASUVORK5CYII=",
      "base64"
    );
    const presetTemplate = await fs.readFile(
      path.join(root, "tests", "fixtures", "preset-import", "missing-texture.milk"),
      "utf8"
    );
    const presetPaths = [];
    for (const [index, label] of labels.entries()) {
      const directory = path.join(temporaryRoot, `Cartella ${label}`);
      await fs.mkdir(directory, { recursive: true });
      const presetPath = path.join(directory, `Preset ${label}.milk`);
      await fs.writeFile(
        presetPath,
        `${presetTemplate}\n// unicode-case:${index}:${label}\n`,
        "utf8"
      );
      await fs.writeFile(path.join(directory, "missing-nebula.png"), png);
      presetPaths.push(presetPath);
    }
    let longDirectory = path.join(temporaryRoot, "Percorso lungo");
    while (longDirectory.length < 235) {
      longDirectory = path.join(
        longDirectory,
        `segmento-${String(longDirectory.length).padStart(3, "0")}-abcdefghijklmnop`
      );
    }
    await fs.mkdir(longDirectory, { recursive: true });
    const longPreset = path.join(longDirectory, "Preset lungo Ω.milk");
    await fs.writeFile(longPreset, `${presetTemplate}\n// long-path\n`, "utf8");
    await fs.writeFile(path.join(longDirectory, "missing-nebula.png"), png);
    presetPaths.push(longPreset);

    const service = new ProjectMHostService({
      hostPath,
      libraryPath,
      presetPath: bundledPath
    });
    try {
      const initialized = await service.initialize(96, 128);
      assert.equal(initialized.available, true, initialized.error);
      assert.equal(initialized.version, "4.1.6");
      for (const [index, presetPath] of presetPaths.entries()) {
        const loaded = await service.loadPreset(presetPath, {
          smoothTransition: index > 0,
          transitionSeconds: 0.03
        });
        assert.equal(loaded.receivedPresetPath, presetPath);
        assert.equal(
          loaded.presetPathUtf8Bytes,
          Buffer.byteLength(presetPath, "utf8")
        );
        assert.equal(loaded.activeCodePage, 65001);
        assert.notEqual(loaded.receivedPresetPath.includes("Î©"), true);
        const pcm = new Float32Array(3200);
        for (let sample = 0; sample < pcm.length; sample += 2) {
          const value = Math.sin(sample / 21) * 0.5;
          pcm[sample] = value;
          pcm[sample + 1] = value;
        }
        const frame = await service.render({
          width: 96,
          height: 128,
          steps: 2,
          channels: 2,
          samples: pcm
        });
        assert.ok(frame);
        assert.ok(frame.bytes.some((value) => value !== 0));

        for (const mode of ["copy", "link"]) {
          const libraryRoot = path.join(
            temporaryRoot,
            `library-${index}-${mode}`
          );
          const presetLibrary = new PresetLibraryService(libraryRoot);
          await presetLibrary.initialize();
          const importer = new PresetImportService(
            presetLibrary,
            async (candidate) => {
              const status = await service.loadPreset(candidate, {
                smoothTransition: false
              });
              const preview = await service.render({
                width: 64,
                height: 96,
                steps: 1,
                channels: 2,
                samples: new Float32Array(1600)
              });
              return {
                valid: Boolean(preview),
                error: "",
                version: status.version,
                frameHash: String(preview?.frameIndex ?? 0)
              };
            }
          );
          const report = await importer.importFolder(
            path.dirname(presetPath),
            mode
          );
          assert.equal(report.issues.length, 0, JSON.stringify(report.issues));
          assert.equal(report.quarantined.length, 0);
          assert.equal(report.imported.length, 1);
          assert.equal(report.imported[0].missingTextures.length, 0);
          if (mode === "link") {
            assert.equal(report.imported[0].path, presetPath);
          }
          const reopened = new PresetLibraryService(libraryRoot);
          await reopened.initialize();
          const persisted = reopened.state.presets.find(
            (record) => record.id === report.imported[0].id
          );
          assert.ok(persisted);
          assert.equal(persisted.path, report.imported[0].path);
          const relinked = await reopened.relink(
            persisted.id,
            report.imported[0].path
          );
          assert.equal(relinked.hash, persisted.hash);
        }

        const project = createDefaultProject();
        project.projectM.presetId = `unicode-${index}`;
        project.projectM.sequenceStartPresetId = `unicode-${index}`;
        project.projectM.presetPath = presetPath;
        project.projectM.presetName = path.basename(presetPath, ".milk");
        const reopenedProject = normalizeProject(
          JSON.parse(JSON.stringify(project))
        );
        assert.equal(reopenedProject.projectM.presetPath, presetPath);
        assert.equal(
          reopenedProject.projectM.sequenceStartPresetId,
          `unicode-${index}`
        );
      }

      const prefixed = longPreset.startsWith("\\\\")
        ? `\\\\?\\UNC\\${longPreset.slice(2)}`
        : `\\\\?\\${longPreset}`;
      const prefixedStatus = await service.loadPreset(prefixed);
      assert.equal(prefixedStatus.receivedPresetPath, prefixed);
      assert.equal(
        prefixedStatus.presetPathUtf8Bytes,
        Buffer.byteLength(prefixed, "utf8")
      );

      const audioPath = path.join(temporaryRoot, "Audio Ω 日本語 🚀 15s.wav");
      const outputPath = path.join(
        temporaryRoot,
        "Export Ω accenti Кириллица 日本語 中文 🚀.mp4"
      );
      const audio = spawnSync(
        ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=220:sample_rate=48000:duration=15",
          "-c:a",
          "pcm_s16le",
          audioPath
        ],
        { encoding: "utf8" }
      );
      assert.equal(audio.status, 0, audio.stderr);
      const records = presetPaths.map((presetPath, index) =>
        presetRecord(`unicode-${index}`, path.basename(presetPath), presetPath)
      );
      const project = createDefaultProject();
      project.audioFile = audioPath;
      project.exportSettings.width = 96;
      project.exportSettings.height = 128;
      project.exportSettings.fps = 30;
      project.exportSettings.videoBitrate = "1M";
      project.projectM.presetId = records[0].id;
      project.projectM.sequenceStartPresetId = records[0].id;
      project.projectM.presetPath = records[0].path;
      project.projectM.playlistIds = records.map((record) => record.id);
      project.projectM.randomSeed = 0x00c0ffee;
      project.projectM.autoSwitch.enabled = true;
      project.projectM.autoSwitch.mode = "interval";
      project.projectM.autoSwitch.order = "sequential";
      project.projectM.autoSwitch.intervalSeconds = 1;
      project.projectM.autoSwitch.minimumSeconds = 1;
      project.projectM.autoSwitch.maximumSeconds = 1;
      project.projectM.transition.enabled = true;
      project.projectM.transition.durationSeconds = 0.1;
      for (const layer of project.layers) {
        if (layer.kind !== "projectM") layer.visible = false;
      }
      const encoderArgs = [
        "-hide_banner",
        "-y",
        "-f",
        "rawvideo",
        "-pixel_format",
        "rgba",
        "-video_size",
        "96x128",
        "-framerate",
        "30",
        "-i",
        "pipe:0",
        "-i",
        audioPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libopenh264",
        "-profile:v",
        "high",
        "-allow_skip_frames",
        "0",
        "-rc_mode",
        "bitrate",
        "-b:v",
        "1M",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        outputPath
      ];
      const runtime = await renderProjectMExport(
        null,
        ffmpegPath,
        encoderArgs,
        project,
        records,
        { progress: () => {}, warning: () => {} }
      );
      const metrics = await runtime.completion;
      assert.equal(metrics.failedChanges, 0, JSON.stringify(metrics.errors));
      assert.equal(metrics.frames, 450);
      assert.equal(metrics.maximumConsecutiveBlackFrames, 0);
      assert.ok(metrics.presetChanges >= records.length - 1);
      assert.deepEqual(
        new Set(metrics.sequence.map((event) => event.presetId)),
        new Set(records.map((record) => record.id))
      );
      assert.ok((await fs.stat(outputPath)).size > 0);

      await assert.rejects(
        service.loadPreset("C:\\Preset\\\ud800\\bad.milk"),
        /surrogato UTF-16 alto non accoppiato/
      );
    } finally {
      await service.shutdown();
    }
  }
);
