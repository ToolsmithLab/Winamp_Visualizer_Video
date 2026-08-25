"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const {
  createDefaultProject,
  normalizeProject
} = require("../dist/shared/project");
const {
  buildPresetSequence,
  manualPresetChoice
} = require("../dist/shared/presetSequencer");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");

const root = path.resolve(__dirname, "..");
const bundled = path.join(
  root,
  "assets",
  "projectm",
  "presets",
  "AVS Audio Wave.milk"
);
const valid = path.join(root, "tests", "fixtures", "preset-import", "valid.milk");
const corrupt = path.join(
  root,
  "tests",
  "fixtures",
  "preset-import",
  "corrupt.milk"
);
const missingTexture = path.join(
  root,
  "tests",
  "fixtures",
  "preset-import",
  "missing-texture.milk"
);
const paths = {
  hostPath: path.join(root, "native", "bin", "win-x64", "projectm-host.exe"),
  libraryPath: path.join(root, "native", "bin", "win-x64", "projectM-4.dll"),
  presetPath: bundled
};

function configuredProject() {
  const project = createDefaultProject();
  project.projectM.playlistIds = ["a", "b", "c", "d"];
  project.projectM.sequenceStartPresetId = "a";
  project.projectM.presetId = "a";
  project.projectM.randomSeed = 0x51ed270b;
  project.projectM.autoSwitch.enabled = true;
  project.projectM.autoSwitch.mode = "interval";
  project.projectM.autoSwitch.order = "random";
  project.projectM.autoSwitch.minimumSeconds = 1;
  project.projectM.autoSwitch.maximumSeconds = 1;
  project.projectM.autoSwitch.intervalSeconds = 1;
  project.projectM.autoSwitch.noImmediateRepeat = true;
  return project;
}

function sinePcm(frameCount, frequency = 120, sampleRate = 48_000) {
  const samples = new Float32Array(frameCount * 2);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const value = Math.sin((frame / sampleRate) * Math.PI * 2 * frequency) * 0.5;
    samples[frame * 2] = value;
    samples[frame * 2 + 1] = value;
  }
  return samples;
}

function nearlyBlack(bytes) {
  let total = 0;
  let count = 0;
  for (let offset = 0; offset < bytes.length; offset += 64) {
    total += bytes[offset] + bytes[offset + 1] + bytes[offset + 2];
    count += 3;
  }
  return total / Math.max(1, count) < 2;
}

test("lo stesso seed genera la stessa sequenza di 600 secondi", () => {
  const project = configuredProject();
  const first = buildPresetSequence(
    project.projectM,
    project.projectM.playlistIds,
    600
  );
  const second = buildPresetSequence(
    normalizeProject(JSON.parse(JSON.stringify(project))).projectM,
    project.projectM.playlistIds,
    600
  );
  assert.deepEqual(first, second);
  assert.equal(first.length, 601);
});

test("ordine casuale non produce ripetizioni immediate", () => {
  const project = configuredProject();
  const sequence = buildPresetSequence(
    project.projectM,
    project.projectM.playlistIds,
    600
  );
  for (let index = 1; index < sequence.length; index += 1) {
    assert.notEqual(sequence[index].presetId, sequence[index - 1].presetId);
  }
});

test("precedente, successivo e casuale rispettano playlist e seed", () => {
  const project = configuredProject();
  project.projectM.presetId = "b";
  assert.equal(
    manualPresetChoice(project.projectM, project.projectM.playlistIds, "previous"),
    "a"
  );
  assert.equal(
    manualPresetChoice(project.projectM, project.projectM.playlistIds, "next"),
    "c"
  );
  const randomA = manualPresetChoice(
    project.projectM,
    project.projectM.playlistIds,
    "random"
  );
  const randomB = manualPresetChoice(
    project.projectM,
    project.projectM.playlistIds,
    "random"
  );
  assert.equal(randomA, randomB);
  assert.notEqual(randomA, "b");
});

test("un preset selezionato direttamente resta il primo nell'export", () => {
  const project = configuredProject();
  project.projectM.presetId = "imported";
  project.projectM.sequenceStartPresetId = "imported";
  project.projectM.playlistIds = ["a", "b"];
  project.projectM.autoSwitch.enabled = false;
  const sequence = buildPresetSequence(
    project.projectM,
    ["a", "b", "imported"],
    10
  );
  assert.equal(sequence[0]?.presetId, "imported");
});

test("marcatori timeline ed eventi musicali sono serializzati e riproducibili", () => {
  const project = configuredProject();
  project.projectM.autoSwitch.mode = "timeline-markers";
  project.projectM.markers = [
    { id: "m2", time: 8, label: "Secondo", source: "timeline", presetId: "c" },
    { id: "m1", time: 3, label: "Primo", source: "timeline", presetId: null },
    { id: "beat", time: 4, label: "Beat", source: "music", presetId: null }
  ];
  const restored = normalizeProject(JSON.parse(JSON.stringify(project)));
  const timeline = buildPresetSequence(
    restored.projectM,
    restored.projectM.playlistIds,
    20
  );
  assert.deepEqual(timeline.map((event) => event.time), [0, 3, 8]);
  assert.equal(timeline.at(-1).presetId, "c");
  restored.projectM.autoSwitch.mode = "music-events";
  assert.deepEqual(
    buildPresetSequence(restored.projectM, restored.projectM.playlistIds, 20)
      .map((event) => event.time),
    [0, 4]
  );
});

test("playlist, seed, lock, transizione, cronologia e marcatori persistono", () => {
  const project = configuredProject();
  project.projectM.locked = true;
  project.projectM.transition = { enabled: true, durationSeconds: 1.75 };
  project.projectM.particleSeed = 123;
  project.projectM.history = [
    { presetId: "b", at: 12.5, source: "manual" }
  ];
  project.projectM.markers = [
    { id: "x", time: 5, label: "Cambio", source: "timeline", presetId: "c" }
  ];
  const restored = normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.projectM.playlistIds, ["a", "b", "c", "d"]);
  assert.equal(restored.projectM.randomSeed, project.projectM.randomSeed);
  assert.equal(restored.projectM.particleSeed, 123);
  assert.equal(restored.projectM.locked, true);
  assert.equal(restored.projectM.transition.durationSeconds, 1.75);
  assert.deepEqual(restored.projectM.history, project.projectM.history);
  assert.deepEqual(restored.projectM.markers, project.projectM.markers);
});

test(
  "projectM esegue 100 cambi manuali con soft-cut senza riavviare l'host",
  { timeout: 120_000 },
  async () => {
    const service = new ProjectMHostService(paths);
    try {
      const status = await service.initialize(96, 128);
      assert.equal(status.available, true, status.error);
      const pid = status.pid;
      await service.setPresetLocked(true);
      let maximumBlackRun = 0;
      let blackRun = 0;
      for (let index = 0; index < 100; index += 1) {
        const presetPath = index % 2 === 0 ? valid : bundled;
        const loaded = await service.loadPreset(presetPath, {
          smoothTransition: true,
          transitionSeconds: 0.05
        });
        assert.equal(loaded.pid, pid);
        const frame = await service.render({
          width: 96,
          height: 128,
          steps: 2,
          channels: 2,
          samples: sinePcm(3200, 80 + (index % 4) * 40)
        });
        assert.ok(frame);
        blackRun = nearlyBlack(frame.bytes) ? blackRun + 1 : 0;
        maximumBlackRun = Math.max(maximumBlackRun, blackRun);
      }
      assert.ok(maximumBlackRun < 5, `Sequenza nera massima: ${maximumBlackRun}`);
      assert.equal(service.status.pid, pid);
    } finally {
      await service.shutdown();
    }
  }
);

test(
  "100 cambi automatici seguono la sequenza deterministica reale",
  { timeout: 120_000 },
  async () => {
    const project = configuredProject();
    project.projectM.playlistIds = ["a", "b"];
    project.projectM.sequenceStartPresetId = "a";
    const sequence = buildPresetSequence(
      project.projectM,
      project.projectM.playlistIds,
      100
    );
    assert.equal(sequence.length, 101);
    const service = new ProjectMHostService(paths);
    try {
      const status = await service.initialize(80, 120);
      assert.equal(status.available, true, status.error);
      await service.setPresetLocked(true);
      for (const event of sequence.slice(1)) {
        await service.loadPreset(event.presetId === "a" ? bundled : valid, {
          smoothTransition: true,
          transitionSeconds: 0.03
        });
        const frame = await service.render({
          width: 80,
          height: 120,
          steps: 1,
          channels: 2,
          samples: sinePcm(1600)
        });
        assert.ok(frame?.bytes.some((value) => value !== 0));
      }
    } finally {
      await service.shutdown();
    }
  }
);

test(
  "preset corrotto usa fallback e texture mancante non chiude il motore",
  { timeout: 30_000 },
  async () => {
    const service = new ProjectMHostService(paths);
    try {
      const status = await service.initialize(96, 128);
      assert.equal(status.available, true, status.error);
      const beforePid = status.pid;
      await assert.rejects(
        service.loadPreset(`${corrupt}.missing`, {
          smoothTransition: true,
          transitionSeconds: 0.1
        })
      );
      const fallback = await service.render({
        width: 96,
        height: 128,
        steps: 1,
        channels: 2,
        samples: sinePcm(1600)
      });
      assert.ok(fallback?.bytes.some((value) => value !== 0));
      const warningPreset = await service.loadPreset(missingTexture, {
        smoothTransition: true,
        transitionSeconds: 0.1
      });
      assert.equal(warningPreset.pid, beforePid);
      assert.ok(
        await service.render({
          width: 96,
          height: 128,
          steps: 2,
          channels: 2,
          samples: sinePcm(3200)
        })
      );
    } finally {
      await service.shutdown();
    }
  }
);

test(
  "transizione disattivata, pausa e seek mantengono audio e framebuffer",
  { timeout: 30_000 },
  async () => {
    const service = new ProjectMHostService(paths);
    try {
      const status = await service.initialize(96, 128);
      assert.equal(status.available, true, status.error);
      const pid = status.pid;
      await service.loadPreset(valid, {
        smoothTransition: false,
        transitionSeconds: 0
      });
      const hardCut = await service.render({
        width: 96,
        height: 128,
        steps: 1,
        channels: 2,
        samples: sinePcm(1600)
      });
      assert.ok(hardCut?.bytes.some((value) => value !== 0));

      await service.loadPreset(bundled, {
        smoothTransition: true,
        transitionSeconds: 1
      });
      const beforePause = await service.render({
        width: 96,
        height: 128,
        steps: 2,
        channels: 2,
        samples: sinePcm(3200)
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(service.status.pid, pid);
      const afterPause = await service.render({
        width: 96,
        height: 128,
        steps: 1,
        channels: 2,
        samples: sinePcm(1600)
      });
      assert.ok(beforePause && afterPause);

      const reset = await service.reset(96, 128);
      assert.equal(reset.pid, pid);
      await service.setPresetLocked(true);
      await service.loadPreset(valid, {
        smoothTransition: false,
        transitionSeconds: 0
      });
      const afterSeek = await service.render({
        width: 96,
        height: 128,
        steps: 1,
        channels: 2,
        samples: sinePcm(1600, 220)
      });
      assert.ok(afterSeek?.bytes.some((value) => value !== 0));
    } finally {
      await service.shutdown();
    }
  }
);
