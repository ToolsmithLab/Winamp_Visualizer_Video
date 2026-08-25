"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createCanvas, ImageData } = require("@napi-rs/canvas");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");
const {
  convertProjectMBgraToOverlayRgba
} = require("../dist/shared/projectMOverlay");

const root = path.resolve(__dirname, "..");
const outputDirectory = path.resolve(
  process.argv[2] || "test-results/projectm-bottom-band"
);
const presetPath = path.resolve(
  process.argv[3] ||
    path.join(root, "assets", "projectm", "presets", "AVS Audio Wave.milk")
);

const requestedWidth = Number(process.argv[4] || 0);
const requestedHeight = Number(process.argv[5] || 0);
const warmupFrames = Math.max(1, Number(process.argv[6] || 6));
const formats =
  requestedWidth > 0 && requestedHeight > 0
    ? [["custom", requestedWidth, requestedHeight]]
    : [
        ["9x16", 270, 480],
        ["1x1", 360, 360],
        ["4x3", 480, 360],
        ["16x9", 480, 270]
      ];

function pcm(frameCount, sampleRate = 48_000) {
  const samples = new Float32Array(frameCount * 2);
  for (let index = 0; index < frameCount; index += 1) {
    const value =
      Math.sin((2 * Math.PI * 110 * index) / sampleRate) * 0.62 +
      Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.18;
    samples[index * 2] = value;
    samples[index * 2 + 1] = value;
  }
  return samples;
}

function rowMetrics(bytes, width, height, stride, row) {
  const start = row * stride;
  let initializedPixels = 0;
  let blackPixels = 0;
  let luminance = 0;
  let minimumAlpha = 255;
  let maximumAlpha = 0;
  const first = bytes.subarray(start, start + 4);
  let uniform = true;
  for (let x = 0; x < width; x += 1) {
    const offset = start + x * 4;
    const blue = bytes[offset];
    const green = bytes[offset + 1];
    const red = bytes[offset + 2];
    const alpha = bytes[offset + 3];
    if (red || green || blue || alpha) initializedPixels += 1;
    if (red <= 4 && green <= 4 && blue <= 4) blackPixels += 1;
    luminance += red * 0.2126 + green * 0.7152 + blue * 0.0722;
    minimumAlpha = Math.min(minimumAlpha, alpha);
    maximumAlpha = Math.max(maximumAlpha, alpha);
    if (
      blue !== first[0] ||
      green !== first[1] ||
      red !== first[2] ||
      alpha !== first[3]
    ) {
      uniform = false;
    }
  }
  return {
    row,
    initializedPixels,
    blackPixels,
    averageLuminance: luminance / width,
    minimumAlpha,
    maximumAlpha,
    uniform
  };
}

async function main() {
  await fs.mkdir(outputDirectory, { recursive: true });
  const service = new ProjectMHostService({
    hostPath: path.join(root, "native", "bin", "win-x64", "projectm-host.exe"),
    libraryPath: path.join(root, "native", "bin", "win-x64", "projectM-4.dll"),
    presetPath
  });
  const results = [];
  try {
    for (const [name, width, height] of formats) {
      const status =
        results.length === 0
          ? await service.initialize(width, height)
          : await service.reset(width, height);
      if (!status.available) throw new Error(status.error);
      let frame = null;
      for (let index = 0; index < warmupFrames; index += 1) {
        frame = await service.render({
          width,
          height,
          steps: 1,
          channels: 2,
          samples: pcm(1600)
        });
      }
      if (!frame) throw new Error(`Framebuffer assente per ${name}.`);
      const rgba = convertProjectMBgraToOverlayRgba(
        frame.bytes,
        frame.width,
        frame.height,
        frame.stride
      );
      const canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      context.putImageData(new ImageData(rgba, width, height), 0, 0);
      await fs.writeFile(
        path.join(outputDirectory, `projectm-${name}.png`),
        canvas.toBuffer("image/png")
      );
      results.push({
        name,
        requested: { width, height },
        frame: {
          width: frame.width,
          height: frame.height,
          stride: frame.stride,
          byteLength: frame.bytes.byteLength
        },
        rows: [
          rowMetrics(frame.bytes, width, height, frame.stride, 0),
          ...Array.from({ length: Math.min(10, height) }, (_, index) =>
            rowMetrics(
              frame.bytes,
              width,
              height,
              frame.stride,
              height - Math.min(10, height) + index
            )
          )
        ]
      });
    }
  } finally {
    await service.shutdown();
  }
  await fs.writeFile(
    path.join(outputDirectory, "probe.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
