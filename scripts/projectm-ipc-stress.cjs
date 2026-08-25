"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");

const root = path.resolve(__dirname, "..");
const outputPath = path.resolve(
  process.argv[2] ||
    "test-results/projectm-ipc-framing/projectm-ipc-stress-100000.json"
);
const requestTarget = Number(process.argv[3] || 100_000);
const width = Number(process.argv[4] || 16);
const height = Number(process.argv[5] || 16);
const runtimePaths = {
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
const alternatePreset = path.join(
  root,
  "tests",
  "fixtures",
  "preset-import",
  "parity-one.milk"
);
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function processSnapshot() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers
  };
}

function createPcm() {
  const frames = 1_600;
  const samples = new Float32Array(frames * 2);
  for (let index = 0; index < frames; index += 1) {
    const value = Math.sin((2 * Math.PI * 220 * index) / 48_000) * 0.5;
    samples[index * 2] = value;
    samples[index * 2 + 1] = value;
  }
  return samples;
}

async function main() {
  if (!Number.isInteger(requestTarget) || requestTarget < 100_000) {
    throw new Error("Lo stress IPC richiede almeno 100.000 render.");
  }
  const service = new ProjectMHostService(runtimePaths);
  const pcm = createPcm();
  const report = {
    generatedAt: new Date().toISOString(),
    requestTarget,
    width,
    height,
    completedRenders: 0,
    nullFrames: 0,
    errors: [],
    restarts: 0,
    resets: 0,
    resizeOperations: 0,
    seekResets: 0,
    pauseResumeCycles: 0,
    presetChanges: 0,
    lockChanges: 0,
    firstFrameIndex: null,
    lastFrameIndex: null,
    startedMemory: processSnapshot(),
    samples: []
  };
  const unhandledRejections = [];
  const onUnhandledRejection = (error) => {
    unhandledRejections.push(
      error instanceof Error ? error.stack : String(error)
    );
  };
  process.on("unhandledRejection", onUnhandledRejection);
  const started = performance.now();
  try {
    let activeWidth = width;
    let activeHeight = height;
    let status = await service.initialize(activeWidth, activeHeight, 0x5a17c0den);
    if (!status.available) throw new Error(status.error);
    for (let index = 0; index < requestTarget; index += 1) {
      if (index > 0 && index % 25_000 === 0) {
        await service.shutdown();
        status = await service.initialize(
          activeWidth,
          activeHeight,
          0x5a17c0den
        );
        if (!status.available) throw new Error(status.error);
        report.restarts += 1;
      }
      if (index > 0 && index % 2_500 === 0) {
        // Pausa reale del flusso: nessun PCM viene inviato durante l'attesa.
        await delay(5);
        report.pauseResumeCycles += 1;
      }

      const renderPromise = service.render({
        width: activeWidth,
        height: activeHeight,
        steps: 1,
        channels: 2,
        samples: pcm
      });
      let controlPromise = null;
      if (index > 0 && index % 7_500 === 0) {
        // Il reset deterministico è il comando host usato dal seek offline.
        controlPromise = service.reset(
          activeWidth,
          activeHeight,
          0x5a17c0den
        );
        report.resets += 1;
        report.seekResets += 1;
      } else if (index > 0 && index % 5_000 === 0) {
        const nextWidth = activeWidth === width ? width + 8 : width;
        const nextHeight = activeHeight === height ? height + 8 : height;
        controlPromise = service.reset(
          nextWidth,
          nextHeight,
          0x5a17c0den
        );
        activeWidth = nextWidth;
        activeHeight = nextHeight;
        report.resets += 1;
        report.resizeOperations += 1;
      } else if (index > 0 && index % 2_000 === 0) {
        controlPromise = service.loadPreset(
          report.presetChanges % 2 === 0
            ? alternatePreset
            : runtimePaths.presetPath,
          { smoothTransition: true, transitionSeconds: 0.1 }
        );
        report.presetChanges += 1;
      } else if (index > 0 && index % 1_000 === 0) {
        controlPromise = service.setPresetLocked(
          report.lockChanges % 2 === 0
        );
        report.lockChanges += 1;
      }
      const frame = controlPromise
        ? (await Promise.all([renderPromise, controlPromise]))[0]
        : await renderPromise;
      if (!frame) {
        report.nullFrames += 1;
        continue;
      }
      report.completedRenders += 1;
      report.firstFrameIndex ??= frame.frameIndex;
      report.lastFrameIndex = frame.frameIndex;

      if ((index + 1) % 10_000 === 0) {
        report.samples.push({
          completedRenders: report.completedRenders,
          elapsedSeconds: (performance.now() - started) / 1000,
          frameIndex: frame.frameIndex,
          latencyMs: frame.latencyMs,
          renderMs: frame.renderMs,
          memory: processSnapshot()
        });
        process.stdout.write(
          `projectM IPC stress: ${index + 1}/${requestTarget}\n`
        );
      }
    }

    // La chiusura viene accodata mentre l'ultimo render è ancora attivo.
    const finalRender = service.render({
      width,
      height,
      steps: 1,
      channels: 2,
      samples: pcm
    });
    const [, shutdownResult] = await Promise.all([
      finalRender,
      service.shutdown()
    ]);
    void shutdownResult;
  } catch (error) {
    report.errors.push(error instanceof Error ? error.stack : String(error));
    throw error;
  } finally {
    await service.shutdown();
    await new Promise((resolve) => setImmediate(resolve));
    process.off("unhandledRejection", onUnhandledRejection);
    report.pendingRequestsFinal = service.pending.size;
    report.hostAttachedFinal = service.child !== null;
    report.unhandledRejections = unhandledRejections;
    report.elapsedSeconds = (performance.now() - started) / 1000;
    report.finishedMemory = processSnapshot();
    report.completedAt = new Date().toISOString();
    report.pass =
      report.completedRenders === requestTarget &&
      report.nullFrames === 0 &&
      report.errors.length === 0 &&
      report.pendingRequestsFinal === 0 &&
      report.hostAttachedFinal === false &&
      report.unhandledRejections.length === 0;
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (!report.pass) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
