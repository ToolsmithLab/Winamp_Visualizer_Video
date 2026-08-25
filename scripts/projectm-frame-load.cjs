"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");

const root = path.resolve(__dirname, "..");
const durationMs = Number(process.argv[2] || 12_000);
const outputPath = path.resolve(
  process.argv[3] || "test-results/phase2/projectm-frame-load.json"
);
const width = Number(process.argv[4] || 540);
const height = Number(process.argv[5] || 960);
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

async function main() {
  const service = new ProjectMHostService(paths);
  const pcm = new Float32Array(1470 * 2);
  for (let frame = 0; frame < 1470; frame += 1) {
    const value = Math.sin((2 * Math.PI * 110 * frame) / 44_100) * 0.65;
    pcm[frame * 2] = value;
    pcm[frame * 2 + 1] = value;
  }
  const frames = [];
  try {
    const status = await service.initialize(width, height);
    if (!status.available) throw new Error(status.error);
    const started = performance.now();
    while (performance.now() - started < durationMs) {
      const frame = await service.render({
        width,
        height,
        steps: 1,
        channels: 2,
        samples: pcm
      });
      if (frame) {
        frames.push({
          frameIndex: frame.frameIndex,
          latencyMs: frame.latencyMs,
          renderMs: frame.renderMs,
          bandwidthMbps: frame.bandwidthMbps,
          droppedFrames: frame.droppedFrames
        });
      }
    }
    const average = (key) =>
      frames.reduce((total, frame) => total + frame[key], 0) /
      Math.max(1, frames.length);
    const report = {
      generatedAt: new Date().toISOString(),
      durationMs,
      width,
      height,
      payloadBytes: width * height * 4,
      frames: frames.length,
      effectiveFps: frames.length / (durationMs / 1000),
      averageLatencyMs: average("latencyMs"),
      averageNativeRenderMs: average("renderMs"),
      averageBandwidthMbps: average("bandwidthMbps"),
      maxLatencyMs: Math.max(...frames.map((frame) => frame.latencyMs)),
      minBandwidthMbps: Math.min(
        ...frames.map((frame) => frame.bandwidthMbps)
      ),
      droppedFrames: frames.at(-1)?.droppedFrames ?? 0,
      runtime: status
    };
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await service.shutdown();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
