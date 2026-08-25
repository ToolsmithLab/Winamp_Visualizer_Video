"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");

const root = path.resolve(__dirname, "..");
const output = path.resolve(
  process.argv[2] ||
    path.join(root, "test-results", "phase3-m5", "projectm-determinism.json")
);
const frameCount = Number(process.argv[3] || 180);
const width = Number(process.argv[4] || 180);
const height = Number(process.argv[5] || 320);
const presetPath = path.join(
  root,
  "tests",
  "fixtures",
  "preset-import",
  "parity-one.milk"
);
const runtimePaths = {
  hostPath: path.join(root, "native", "bin", "win-x64", "projectm-host.exe"),
  libraryPath: path.join(root, "native", "bin", "win-x64", "projectM-4.dll"),
  presetPath
};

function pcm(frameIndex) {
  const frames = 1600;
  const samples = new Float32Array(frames * 2);
  for (let index = 0; index < frames; index += 1) {
    const absolute = frameIndex * frames + index;
    const value =
      Math.sin((2 * Math.PI * 72 * absolute) / 48_000) * 0.6 +
      Math.sin((2 * Math.PI * 440 * absolute) / 48_000) * 0.25;
    samples[index * 2] = value;
    samples[index * 2 + 1] = value * 0.97;
  }
  return samples;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function run(label) {
  const service = new ProjectMHostService(runtimePaths);
  const frameHashes = [];
  let status;
  try {
    status = await service.initialize(width, height);
    if (!status.available) throw new Error(status.error);
    await service.setPresetLocked(true);
    for (let index = 0; index < frameCount; index += 1) {
      const frame = await service.render({
        width,
        height,
        steps: 1,
        channels: 2,
        samples: pcm(index)
      });
      if (!frame) throw new Error(`Framebuffer assente: ${label}/${index}`);
      frameHashes.push(sha256(frame.bytes));
    }
  } finally {
    await service.shutdown();
  }
  return {
    label,
    version: status?.version ?? null,
    glRenderer: status?.glRenderer ?? null,
    glVersion: status?.glVersion ?? null,
    frameCount,
    sequenceHash: sha256(Buffer.from(frameHashes.join("\n"), "utf8")),
    firstFrameHash: frameHashes[0],
    middleFrameHash: frameHashes[Math.floor(frameHashes.length / 2)],
    finalFrameHash: frameHashes.at(-1),
    frameHashes
  };
}

async function main() {
  const first = await run("A");
  const second = await run("B");
  const mismatches = first.frameHashes
    .map((hash, index) => ({
      index,
      first: hash,
      second: second.frameHashes[index]
    }))
    .filter((entry) => entry.first !== entry.second);
  const report = {
    generatedAt: new Date().toISOString(),
    projectMVersion: first.version,
    width,
    height,
    frameCount,
    identical: mismatches.length === 0,
    mismatchCount: mismatches.length,
    firstMismatch: mismatches[0] ?? null,
    first,
    second
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({
      generatedAt: report.generatedAt,
      projectMVersion: report.projectMVersion,
      width,
      height,
      frameCount,
      identical: report.identical,
      mismatchCount: report.mismatchCount,
      firstMismatch: report.firstMismatch,
      firstSequenceHash: first.sequenceHash,
      secondSequenceHash: second.sequenceHash
    }, null, 2)}\n`
  );
  if (!report.identical) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
