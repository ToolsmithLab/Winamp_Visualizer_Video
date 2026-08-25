"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const root = path.resolve(__dirname, "..");
const reportPath = path.resolve(process.argv[2] || "");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const outputDirectory = path.dirname(reportPath);
const ffmpeg = path.join(root, "native", "ffmpeg", "win-x64", "ffmpeg.exe");
const { width, height, fps } = report.profile;

function run(args) {
  const result = spawnSync(ffmpeg, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(result.stderr || `FFmpeg ${result.status}`);
}

function capturedFrame(timestamp) {
  const start = Math.max(0, Math.floor(timestamp * fps) - 2);
  for (let frame = start; frame <= Math.ceil(timestamp * fps) + 2; frame += 1) {
    if (Math.abs(timestamp - frame / fps) <= 0.5 / fps + 0.000_001) {
      return frame;
    }
  }
  throw new Error(`Frame non risolto per ${timestamp}.`);
}

async function compare(firstPath, secondPath) {
  const [first, second] = await Promise.all([
    loadImage(firstPath),
    loadImage(secondPath)
  ]);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(first, 0, 0, width, height);
  const a = Buffer.from(canvas.data());
  context.clearRect(0, 0, width, height);
  context.drawImage(second, 0, 0, width, height);
  const b = canvas.data();
  let absolute = 0;
  let square = 0;
  let maximum = 0;
  for (let offset = 0; offset < a.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = Math.abs(a[offset + channel] - b[offset + channel]);
      absolute += difference;
      square += difference * difference;
      maximum = Math.max(maximum, difference);
    }
  }
  const samples = (a.length / 4) * 3;
  const mse = square / samples;
  return {
    meanAbsoluteError: absolute / samples,
    rootMeanSquareError: Math.sqrt(mse),
    psnr: mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse),
    maximumChannelError: maximum
  };
}

async function main() {
  const comparisons = [];
  for (const original of report.comparisons) {
    const frameIndex = capturedFrame(original.timestamp);
    const exportFrame = path.join(
      outputDirectory,
      `export-exact-${original.timestamp.toFixed(3)}.png`
    );
    run([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      report.output,
      "-vf",
      `select=eq(n\\,${frameIndex})`,
      "-fps_mode",
      "passthrough",
      "-frames:v",
      "1",
      exportFrame
    ]);
    comparisons.push({
      timestamp: original.timestamp,
      frameIndex,
      frameTimestamp: frameIndex / fps,
      previewFrame: original.previewFrame,
      exportFrame,
      ...(await compare(original.previewFrame, exportFrame))
    });
  }
  const result = {
    generatedAt: new Date().toISOString(),
    sourceReport: reportPath,
    extraction: "indice frame esatto catturato dal compositor",
    thresholdPsnr: 28,
    passed: comparisons.every(({ psnr }) => psnr >= 28),
    minimumPsnr: Math.min(...comparisons.map(({ psnr }) => psnr)),
    maximumMeanAbsoluteError: Math.max(
      ...comparisons.map(({ meanAbsoluteError }) => meanAbsoluteError)
    ),
    comparisons
  };
  const output = path.join(outputDirectory, "exact-frame-comparisons.json");
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
