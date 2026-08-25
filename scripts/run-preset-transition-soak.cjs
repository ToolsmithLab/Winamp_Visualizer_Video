"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");

const root = path.resolve(__dirname, "..");
const output = path.resolve(
  process.argv[2] || "test-results/phase2/preset-transition-soak-10m.json"
);
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
const alternate = path.join(
  root,
  "tests",
  "fixtures",
  "preset-import",
  "valid.milk"
);

function processSample(pid) {
  const command =
    `$p=Get-Process -Id ${pid} -ErrorAction Stop;` +
    "[pscustomobject]@{CPU=$p.CPU;WorkingSet64=$p.WorkingSet64;" +
    "PrivateMemorySize64=$p.PrivateMemorySize64;HandleCount=$p.HandleCount}" +
    "|ConvertTo-Json -Compress";
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    { encoding: "utf8" }
  );
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return null;
  }
}

function gpuSample() {
  const command =
    "$v=(Get-Counter '\\GPU Engine(*)\\Utilization Percentage' " +
    "-ErrorAction Stop).CounterSamples.CookedValue;" +
    "[math]::Round(($v|Measure-Object -Maximum).Maximum,2)";
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    { encoding: "utf8", timeout: 10_000 }
  );
  const value = Number(result.stdout.trim().replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function pcm(frameCount, frameIndex) {
  const samples = new Float32Array(frameCount * 2);
  const frequency = 80 + (frameIndex % 240) * 0.75;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const value =
      Math.sin(((frameIndex * frameCount + frame) / 48_000) * Math.PI * 2 * frequency) *
      0.55;
    samples[frame * 2] = value;
    samples[frame * 2 + 1] = value;
  }
  return samples;
}

function black(bytes) {
  let total = 0;
  let count = 0;
  for (let offset = 0; offset < bytes.length; offset += 64) {
    total += bytes[offset] + bytes[offset + 1] + bytes[offset + 2];
    count += 3;
  }
  return total / Math.max(1, count) < 2;
}

async function main() {
  const fps = 30;
  const durationSeconds = 600;
  const frames = durationSeconds * fps;
  const samplesPerFrame = 48_000 / fps;
  const service = new ProjectMHostService(paths);
  const cpuBefore = process.cpuUsage();
  const started = performance.now();
  let renderTotalMs = 0;
  let changeTotalMs = 0;
  let changes = 0;
  let blackFrames = 0;
  let blackRun = 0;
  let maximumBlackRun = 0;
  let peakRss = process.memoryUsage().rss;
  const samples = [];
  const gpu = [gpuSample()];
  try {
    const status = await service.initialize(64, 96);
    if (!status.available) throw new Error(status.error);
    await service.setPresetLocked(true);
    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      if (frameIndex > 0 && frameIndex % (6 * fps) === 0) {
        const changeStarted = performance.now();
        await service.loadPreset(changes % 2 === 0 ? alternate : paths.presetPath, {
          smoothTransition: true,
          transitionSeconds: 0.5
        });
        changeTotalMs += performance.now() - changeStarted;
        changes += 1;
      }
      const renderStarted = performance.now();
      const frame = await service.render({
        width: 64,
        height: 96,
        steps: 1,
        channels: 2,
        samples: pcm(samplesPerFrame, frameIndex)
      });
      renderTotalMs += performance.now() - renderStarted;
      if (!frame) throw new Error(`Framebuffer assente al frame ${frameIndex}`);
      if (black(frame.bytes)) {
        blackFrames += 1;
        blackRun += 1;
        maximumBlackRun = Math.max(maximumBlackRun, blackRun);
      } else {
        blackRun = 0;
      }
      if (frameIndex % (60 * fps) === 0) {
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
        samples.push({
          simulatedSecond: frameIndex / fps,
          rendererRss: process.memoryUsage().rss,
          host: processSample(status.pid)
        });
      }
    }
    gpu.push(gpuSample());
    const elapsedMs = performance.now() - started;
    const cpu = process.cpuUsage(cpuBefore);
    const report = {
      generatedAt: new Date().toISOString(),
      simulatedDurationSeconds: durationSeconds,
      elapsedMs,
      frames,
      changes,
      crashes: 0,
      errors: 0,
      blackFrames,
      maximumConsecutiveBlackFrames: maximumBlackRun,
      averageRenderMs: renderTotalMs / frames,
      averageChangeMs: changeTotalMs / Math.max(1, changes),
      effectiveOfflineFps: frames / (elapsedMs / 1000),
      cpuUserMs: cpu.user / 1000,
      cpuSystemMs: cpu.system / 1000,
      peakRendererRssBytes: peakRss,
      hostPid: status.pid,
      gpuUtilizationSamplesPercent: gpu,
      processSamples: samples
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (maximumBlackRun >= 5) process.exitCode = 2;
  } finally {
    await service.shutdown();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
