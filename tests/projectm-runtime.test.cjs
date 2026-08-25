"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");
const {
  encodeProjectMSeed,
  normalizeProjectMSeed,
  PROJECTM_PROTOCOL_VERSION
} = require("../dist/main/projectm/projectMProtocol");
const { createDefaultProject } = require("../dist/shared/project");

const root = path.resolve(__dirname, "..");
const paths = {
  hostPath: path.join(root, "native", "bin", "win-x64", "projectm-host.exe"),
  libraryPath: path.join(root, "native", "bin", "win-x64", "projectM-4.dll"),
  presetPath: path.join(
    root,
    "assets",
    "projectm",
    "presets",
    "AVS Audio Wave.milk"
  )
};
const nativeAvailable =
  process.platform === "win32" &&
  Object.values(paths).every((filePath) => fs.existsSync(filePath));

test("protocollo projectM v2 serializza e valida il seed uint64 little-endian", () => {
  assert.equal(PROJECTM_PROTOCOL_VERSION, 2);
  const seed = 0x0123456789abcdefn;
  const encoded = encodeProjectMSeed(seed);
  assert.equal(encoded.byteLength, 8);
  assert.equal(encoded.toString("hex"), "efcdab8967452301");
  assert.equal(encoded.readBigUInt64LE(), seed);
  assert.equal(normalizeProjectMSeed(0xffffffff), 0xffffffffn);
  assert.throws(() => normalizeProjectMSeed(-1), /non negativo/);
  assert.throws(
    () => normalizeProjectMSeed(0x1_0000_0000_0000_0000n),
    /uint64/
  );
});

function sinePcm(frameCount, frequency = 110, sampleRate = 44_100) {
  const pcm = new Float32Array(frameCount * 2);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const value =
      Math.sin((2 * Math.PI * frequency * frame) / sampleRate) * 0.65;
    pcm[frame * 2] = value;
    pcm[frame * 2 + 1] = value;
  }
  return pcm;
}

test("projectM mancante viene segnalato senza avviare o chiudere l'app", async () => {
  const service = new ProjectMHostService({
    ...paths,
    libraryPath: path.join(root, "native", "bin", "win-x64", "missing.dll")
  });
  const status = await service.initialize(270, 480);
  assert.equal(status.available, false);
  assert.equal(status.running, false);
  assert.match(status.error, /Libreria projectM mancante/);
  await service.shutdown();
});

test("un errore sincrono sulla pipe projectM viene propagato senza Promise orfane", async () => {
  const service = new ProjectMHostService(paths);
  service.child = {
    exitCode: 0,
    stdin: {
      destroyed: false,
      write() {
        throw new Error("write EOF");
      }
    }
  };
  service.writer = {
    count: 0,
    enqueue() {
      return Promise.reject(new Error("write EOF"));
    },
    close() {}
  };
  service.statusValue = {
    ...service.status,
    available: true,
    running: true
  };

  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  try {
    await assert.rejects(
      service.render({
        width: 16,
        height: 16,
        steps: 1,
        channels: 2,
        samples: sinePcm(64)
      }),
      /write EOF/
    );
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off("unhandledRejection", onUnhandled);
    service.child = null;
    service.writer = null;
  }

  assert.equal(service.pending.size, 0);
  assert.deepEqual(unhandled, []);
});

test(
  "libprojectM 4.1.6 riceve PCM e genera un framebuffer BGRA reale",
  { skip: !nativeAvailable },
  async () => {
    const service = new ProjectMHostService(paths);
    try {
      const status = await service.initialize(270, 480);
      assert.equal(status.available, true, status.error);
      assert.equal(status.running, true);
      assert.equal(status.version, "4.1.6");
      assert.equal(status.preset, "AVS Audio Wave.milk");
      assert.ok(status.pcmMaxSamples > 0);
      assert.ok(status.glRenderer.length > 0);

      const frame = await service.render({
        width: 270,
        height: 480,
        steps: 2,
        channels: 2,
        samples: sinePcm(2940)
      });
      assert.ok(frame);
      assert.equal(frame.width, 270);
      assert.equal(frame.height, 480);
      assert.equal(frame.stride, 1080);
      assert.equal(frame.bytes.byteLength, 270 * 480 * 4);
      assert.equal(frame.pcmSamples, 2940);
      assert.equal(frame.advancedFrames, 2);
      let coloredPixels = 0;
      for (let offset = 0; offset < frame.bytes.length; offset += 4) {
        if (
          frame.bytes[offset] ||
          frame.bytes[offset + 1] ||
          frame.bytes[offset + 2]
        ) {
          coloredPixels += 1;
        }
      }
      assert.ok(
        coloredPixels > 100,
        `Framebuffer inatteso: solo ${coloredPixels} pixel colorati`
      );
    } finally {
      await service.shutdown();
    }
    assert.equal(service.status.running, false);
    assert.equal(service.status.pid, null);
  }
);

test(
  "backpressure mantiene una richiesta frame in volo e scarta l'obsoleta",
  { skip: !nativeAvailable },
  async () => {
    const service = new ProjectMHostService(paths);
    try {
      const status = await service.initialize(270, 480);
      assert.equal(status.available, true, status.error);
      const request = {
        width: 270,
        height: 480,
        steps: 2,
        channels: 2,
        samples: sinePcm(2940)
      };
      const firstPromise = service.render(request);
      const obsolete = await service.render(request);
      const first = await firstPromise;
      assert.equal(obsolete, null);
      assert.ok(first);
      assert.ok(first.droppedFrames >= 1);
    } finally {
      await service.shutdown();
    }
  }
);

test(
  "play, pausa, ripresa e seek mantengono il lifecycle nativo",
  { skip: !nativeAvailable },
  async () => {
    const service = new ProjectMHostService(paths);
    try {
      const status = await service.initialize(270, 480);
      assert.equal(status.available, true, status.error);
      const playFrame = await service.render({
        width: 270,
        height: 480,
        steps: 1,
        channels: 2,
        samples: sinePcm(1470, 90)
      });
      assert.ok(playFrame);

      // Pausa: nessuna chiamata render/PCM, il processo resta vivo.
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(service.status.running, true);

      const resumedFrame = await service.render({
        width: 270,
        height: 480,
        steps: 1,
        channels: 2,
        samples: sinePcm(1470, 220)
      });
      assert.ok(resumedFrame.frameIndex > playFrame.frameIndex);

      // Seek/nuovo audio: reset completo del motore, poi nuovo PCM.
      const resetStatus = await service.reset(270, 480);
      assert.equal(resetStatus.running, true, resetStatus.error);
      const seekFrame = await service.render({
        width: 270,
        height: 480,
        steps: 1,
        channels: 2,
        samples: sinePcm(1470, 440)
      });
      assert.equal(seekFrame.frameIndex, 1);
    } finally {
      await service.shutdown();
    }
  }
);

test(
  "inizializzazione e distruzione projectM superano 20 cicli",
  { skip: !nativeAvailable, timeout: 120_000 },
  async () => {
    const service = new ProjectMHostService(paths);
    try {
      let status = await service.initialize(135, 240);
      assert.equal(status.available, true, status.error);
      for (let cycle = 1; cycle <= 20; cycle += 1) {
        status = await service.reset(135, 240);
        assert.equal(status.running, true, `ciclo ${cycle}: ${status.error}`);
        assert.equal(status.version, "4.1.6");
        const frame = await service.render({
          width: 135,
          height: 240,
          steps: 1,
          channels: 2,
          samples: sinePcm(735, 80 + cycle * 10)
        });
        assert.ok(frame, `frame nullo al ciclo ${cycle}`);
      }
    } finally {
      await service.shutdown();
    }
    assert.equal(service.status.running, false);
  }
);

test("il livello projectM è reale, persistibile e disattivabile", () => {
  const project = createDefaultProject();
  const layer = project.layers.find((candidate) => candidate.kind === "projectM");
  assert.ok(layer);
  assert.equal(project.projectM.enabled, true);
  assert.equal(layer.visible, true);
  project.projectM.enabled = false;
  layer.visible = false;
  const restored = JSON.parse(JSON.stringify(project));
  assert.equal(restored.projectM.enabled, false);
  assert.equal(
    restored.layers.find((candidate) => candidate.kind === "projectM").visible,
    false
  );
});
