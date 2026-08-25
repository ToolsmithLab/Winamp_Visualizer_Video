"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  createDefaultProject,
  normalizeProject
} = require("../dist/shared/project");
const {
  pluginRegistry
} = require("../dist/engine/plugins/registry");

const root = path.resolve(__dirname, "..");
const phase2ReportPath = path.resolve(
  process.argv[2] ||
    path.join(
      root,
      "test-results",
      "phase2-final-20260728",
      "portable-demo-prepare.json"
    )
);
const outputRoot = path.resolve(
  process.argv[3] || path.join(root, "test-results", "phase3-m5", "soak")
);
const prepared = JSON.parse(fs.readFileSync(phase2ReportPath, "utf8"));
const audioSource = prepared.assets.audio600;
const coverPath = prepared.assets.coverPath;
if (!fs.existsSync(audioSource) || !fs.existsSync(coverPath)) {
  throw new Error("Asset reali Fase 2 non disponibili per il soak M5.");
}
for (const record of prepared.selectedPresets) {
  if (!fs.existsSync(record.path)) {
    throw new Error(`Preset reale soak non disponibile: ${record.path}`);
  }
}

fs.mkdirSync(path.join(outputRoot, "media"), { recursive: true });
const relinkAudio = path.join(outputRoot, "media", "audio-relinked-600s.wav");
fs.copyFileSync(audioSource, relinkAudio);

const project = createDefaultProject();
project.name = "Audit finale Fase 3 M5 — soak reale";
project.audioFile = audioSource;
project.audioName = path.basename(audioSource);
project.cover.filePath = coverPath;
project.cover.fileName = path.basename(coverPath);
project.text.artist = "Artista Audit M5";
project.text.title = "Soak Fase 3 — 10 minuti";
project.canvas.width = 540;
project.canvas.height = 960;
project.canvas.fps = 30;
project.exportSettings.width = 180;
project.exportSettings.height = 320;
project.exportSettings.fps = 30;
project.exportSettings.videoBitrate = "2M";
project.projectM = structuredClone(prepared.snapshot.projectMSettings);
project.projectM.enabled = true;
project.projectM.fps = 30;
project.projectM.autoSwitch.enabled = true;
project.projectM.autoSwitch.mode = "interval";
project.projectM.autoSwitch.intervalSeconds = 30;
project.projectM.autoSwitch.minimumSeconds = 30;
project.projectM.autoSwitch.maximumSeconds = 30;
project.projectM.transition = { enabled: true, durationSeconds: 1.25 };
project.projectM.randomSeed = 0x5a17c0de;
project.projectM.playlistIds = prepared.selectedPresets.map((item) => item.id);
project.projectM.sequenceStartPresetId = project.projectM.playlistIds[0];
project.projectM.presetId = project.projectM.playlistIds[0];
project.projectM.presetName = prepared.selectedPresets[0].name;
project.projectM.presetPath = prepared.selectedPresets[0].path;
project.projectM.presetHash = prepared.selectedPresets[0].hash;

const presentPluginIds = new Set(
  project.layers
    .filter((layer) => layer.kind === "visualizer")
    .map((layer) => layer.plugin?.id || layer.pluginId)
);
for (const descriptor of pluginRegistry.list()) {
  if (presentPluginIds.has(descriptor.id)) continue;
  const settings = structuredClone(descriptor.defaultSettings);
  project.layers.push({
    id: `visualizer-${descriptor.id}-m5`,
    name: descriptor.displayName,
    kind: "visualizer",
    pluginId: descriptor.id,
    plugin: {
      id: descriptor.id,
      version: descriptor.version,
      settings
    },
    visible: true,
    locked: false,
    opacity: 0.5,
    blendMode: "screen",
    startTime: 0,
    endTime: null,
    reactive: {
      band:
        settings.band === "bass" ||
        settings.band === "mid" ||
        settings.band === "high"
          ? settings.band
          : "volume",
      sensitivity:
        typeof settings.sensitivity === "number" ? settings.sensitivity : 1,
      smoothing:
        typeof settings.smoothing === "number" ? settings.smoothing : 0.72,
      intensity:
        typeof settings.intensity === "number" ? settings.intensity : 1,
      color: typeof settings.color === "string" ? settings.color : "#8b5cf6"
    },
    transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
    keyframes: []
  });
}
const visualizers = project.layers.filter((layer) => layer.kind === "visualizer");
for (const [index, layer] of visualizers.entries()) {
  layer.visible = true;
  layer.opacity = 0.24 + (index % 4) * 0.08;
  layer.blendMode = ["source-over", "screen", "lighter", "overlay"][
    index % 4
  ];
  layer.startTime = index % 3 === 0 ? 3 : 0;
  layer.endTime = index % 4 === 0 ? 597 : null;
  layer.keyframes = [
    {
      id: `m5-${layer.id}-intensity-0`,
      property: "intensity",
      time: 0,
      value: 0.7 + index * 0.03,
      interpolation: "linear"
    },
    {
      id: `m5-${layer.id}-intensity-300`,
      property: "intensity",
      time: 300,
      value: 1.4 + index * 0.04,
      interpolation: "ease-in-out"
    },
    {
      id: `m5-${layer.id}-intensity-599`,
      property: "intensity",
      time: 599,
      value: 0.9 + index * 0.02,
      interpolation: "ease-out"
    }
  ];
}
const cover = project.layers.find((layer) => layer.kind === "cover");
if (cover) {
  cover.visible = true;
  cover.transform = { x: 0.5, y: 0.35, scaleX: 0.85, scaleY: 1.1, rotation: 0 };
  cover.keyframes = [
    {
      id: "m5-cover-x-0",
      property: "x",
      time: 0,
      value: 0.42,
      interpolation: "ease-in-out"
    },
    {
      id: "m5-cover-x-300",
      property: "x",
      time: 300,
      value: 0.58,
      interpolation: "ease-in-out"
    },
    {
      id: "m5-cover-rotation-0",
      property: "rotation",
      time: 0,
      value: -8,
      interpolation: "linear"
    },
    {
      id: "m5-cover-rotation-599",
      property: "rotation",
      time: 599,
      value: 8,
      interpolation: "linear"
    }
  ];
}
for (const layer of project.layers) {
  if (layer.kind === "projectM" || layer.kind === "artistText" ||
      layer.kind === "titleText") {
    layer.visible = true;
  }
}

const normalized = normalizeProject(project);
const projectPath = path.join(outputRoot, "phase3-m5-soak.avsproject");
fs.writeFileSync(projectPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
const sha256 = (filePath) =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const report = {
  generatedAt: new Date().toISOString(),
  sourcePhase2Report: phase2ReportPath,
  projectPath,
  audioSource,
  relinkAudio,
  coverPath,
  sourceAudioHash: sha256(audioSource),
  relinkAudioHash: sha256(relinkAudio),
  presetCount: prepared.selectedPresets.length,
  pluginCount: visualizers.length,
  visiblePluginCount: visualizers.filter((layer) => layer.visible).length,
  keyframeCount: normalized.layers.reduce(
    (total, layer) => total + layer.keyframes.length,
    0
  ),
  projectSeed: normalized.projectM.randomSeed,
  projectPresetName: "M5 configurazione soak"
};
fs.writeFileSync(
  path.join(outputRoot, "prepare-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
