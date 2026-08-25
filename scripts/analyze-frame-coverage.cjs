"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const inputPath = path.resolve(process.argv[2]);
const timestamp = process.argv[3] || "0";
const width = Number(process.argv[4]);
const height = Number(process.argv[5]);
const reportPath = path.resolve(
  process.argv[6] || "test-results/frame-coverage.json"
);
const ffmpeg = process.env.AVS_FRAME_FFMPEG
  ? path.resolve(process.env.AVS_FRAME_FFMPEG)
  : path.join(root, "native", "ffmpeg", "win-x64", "ffmpeg.exe");

if (!inputPath || !width || !height) {
  throw new Error(
    "Uso: analyze-frame-coverage.cjs <video> <timestamp> <width> <height> [report]"
  );
}

function rowMetrics(bytes, row) {
  const stride = width * 4;
  const start = row * stride;
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let minimumAlpha = 255;
  let maximumAlpha = 0;
  const first = bytes.subarray(start, start + 4);
  let uniform = true;
  for (let x = 0; x < width; x += 1) {
    const offset = start + x * 4;
    const red = bytes[offset];
    const green = bytes[offset + 1];
    const blue = bytes[offset + 2];
    const alpha = bytes[offset + 3];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    luminanceSum += luminance;
    luminanceSquaredSum += luminance * luminance;
    minimumAlpha = Math.min(minimumAlpha, alpha);
    maximumAlpha = Math.max(maximumAlpha, alpha);
    if (
      red !== first[0] ||
      green !== first[1] ||
      blue !== first[2] ||
      alpha !== first[3]
    ) {
      uniform = false;
    }
  }
  const averageLuminance = luminanceSum / width;
  return {
    row,
    averageLuminance,
    luminanceDeviation: Math.sqrt(
      Math.max(0, luminanceSquaredSum / width - averageLuminance ** 2)
    ),
    minimumAlpha,
    maximumAlpha,
    uniform
  };
}

async function main() {
  const decoded = spawnSync(
    ffmpeg,
    [
      "-v",
      "error",
      "-ss",
      timestamp,
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1"
    ],
    { maxBuffer: width * height * 4 + 1024 * 1024 }
  );
  if (decoded.status !== 0) {
    throw new Error(decoded.stderr.toString("utf8") || "Decodifica fallita.");
  }
  const expectedBytes = width * height * 4;
  if (decoded.stdout.byteLength !== expectedBytes) {
    throw new Error(
      `Frame ${decoded.stdout.byteLength} byte; attesi ${expectedBytes}.`
    );
  }
  const rows = Array.from({ length: height }, (_, row) =>
    rowMetrics(decoded.stdout, row)
  );
  const trailingUniformRows = [...rows]
    .reverse()
    .findIndex(
      (row) => !row.uniform || row.luminanceDeviation > 0.01
    );
  const report = {
    generatedAt: new Date().toISOString(),
    inputPath,
    timestamp,
    width,
    height,
    stride: width * 4,
    byteLength: decoded.stdout.byteLength,
    alphaValid: rows.every(
      (row) => row.minimumAlpha === 255 && row.maximumAlpha === 255
    ),
    trailingUniformRows:
      trailingUniformRows < 0 ? height : trailingUniformRows,
    firstRow: rows[0],
    lastTenRows: rows.slice(-10),
    precedingRows: rows.slice(Math.max(0, height - 20), height - 10)
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
