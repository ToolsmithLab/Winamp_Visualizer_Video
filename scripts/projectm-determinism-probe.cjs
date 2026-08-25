"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");

const root = path.resolve(__dirname, "..");
const runtimeRoot =
  process.env.AVS_PROJECTM_RUNTIME ||
  path.join(root, "native", "bin", "win-x64");
const presetRoot =
  process.env.AVS_PRESET_DIR ||
  path.join(
    process.env.TEMP || process.env.TMP,
    "AVSPhase2FinalAudit_20260728_ASCII",
    "official-source"
  );
const wavPath =
  process.env.AVS_REAL_WAV ||
  path.join(
    process.env.TEMP || process.env.TMP,
    "AVSPhase2FinalAudit_20260728_ASCII",
    "audit-multiband-60s.wav"
  );
const outputPath =
  process.env.AVS_PROJECTM_PROBE_OUTPUT ||
  path.join(
    root,
    "test-results",
    "projectm-determinism-fix",
    "native-probe.json"
  );
const ffmpeg = path.join(root, "native", "ffmpeg", "win-x64", "ffmpeg.exe");
const presetNames = [
  "001-line.milk",
  "100-square.milk",
  "101-per_frame.milk",
  "110-per_pixel.milk",
  "200-wave.milk",
  "201-wave.milk",
  "240-wave-smooth-00.milk",
  "250-wavecode.milk",
  "260-compshader-noise_lq.milk",
  "300-beatdetect-bassmidtreb.milk"
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function runtimePaths(presetName) {
  return {
    hostPath: path.join(runtimeRoot, "projectm-host.exe"),
    libraryPath: path.join(runtimeRoot, "projectM-4.dll"),
    presetPath: path.join(presetRoot, presetName)
  };
}

function sinePcm(frameIndex, sampleFrames = 1600) {
  const pcm = new Float32Array(sampleFrames * 2);
  for (let index = 0; index < sampleFrames; index += 1) {
    const time = (frameIndex * sampleFrames + index) / 48_000;
    const value =
      Math.sin(2 * Math.PI * 110 * time) * 0.45 +
      Math.sin(2 * Math.PI * 997 * time) * 0.2;
    pcm[index * 2] = value;
    pcm[index * 2 + 1] = value * 0.83;
  }
  return pcm;
}

function decodeRealWav() {
  if (!fs.existsSync(wavPath)) {
    throw new Error(`WAV reale non trovato: ${wavPath}`);
  }
  const decoded = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      wavPath,
      "-f",
      "f32le",
      "-ac",
      "2",
      "-ar",
      "48000",
      "pipe:1"
    ],
    { encoding: null, maxBuffer: 64 * 1024 * 1024, windowsHide: true }
  );
  if (decoded.status !== 0) {
    throw new Error(
      `Decodifica WAV fallita: ${decoded.stderr?.toString("utf8") || decoded.status}`
    );
  }
  return new Float32Array(
    decoded.stdout.buffer,
    decoded.stdout.byteOffset,
    Math.floor(decoded.stdout.byteLength / 4)
  );
}

function wavPcm(decoded, frameIndex, sampleFrames = 1600) {
  const floatCount = sampleFrames * 2;
  const start = (frameIndex * floatCount) % decoded.length;
  if (start + floatCount <= decoded.length) {
    return decoded.subarray(start, start + floatCount);
  }
  const pcm = new Float32Array(floatCount);
  pcm.set(decoded.subarray(start));
  pcm.set(decoded.subarray(0, floatCount - (decoded.length - start)), decoded.length - start);
  return pcm;
}

async function comparePair({
  name,
  frames,
  seed,
  pcm,
  exerciseControls = false
}) {
  const first = new ProjectMHostService(runtimePaths(presetNames[0]));
  const second = new ProjectMHostService(runtimePaths(presetNames[0]));
  const aggregateA = crypto.createHash("sha256");
  const aggregateB = crypto.createHash("sha256");
  let differences = 0;
  let firstDifference = null;
  let width = 96;
  let height = 128;
  const presetStates = [];
  const started = performance.now();
  try {
    const [statusA, statusB] = await Promise.all([
      first.initialize(width, height, seed),
      second.initialize(width, height, seed)
    ]);
    if (!statusA.available || !statusB.available) {
      throw new Error(statusA.error || statusB.error || "projectM non disponibile");
    }
    if (
      statusA.protocolVersion !== 2 ||
      statusB.protocolVersion !== 2 ||
      statusA.deterministicSeed !== String(seed) ||
      statusB.deterministicSeed !== String(seed)
    ) {
      throw new Error("Handshake seed/protocollo non coerente.");
    }
    await Promise.all([first.setPresetLocked(true), second.setPresetLocked(true)]);

    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      if (exerciseControls && frameIndex === 30) {
        width = 112;
        height = 144;
      }
      if (exerciseControls && frameIndex === 60) {
        await Promise.all([
          first.reset(width, height, seed),
          second.reset(width, height, seed)
        ]);
      }
      if (exerciseControls && frameIndex % 180 === 0) {
        const presetName =
          presetNames[Math.floor(frameIndex / 180) % presetNames.length];
        const presetPath = path.join(presetRoot, presetName);
        const [loadedA, loadedB] = await Promise.all([
          first.loadPreset(presetPath, {
            smoothTransition: frameIndex > 0,
            transitionSeconds: 0.5
          }),
          second.loadPreset(presetPath, {
            smoothTransition: frameIndex > 0,
            transitionSeconds: 0.5
          })
        ]);
        presetStates.push({
          frameIndex,
          presetName,
          a: loadedA.preset,
          b: loadedB.preset
        });
        if (loadedA.preset !== loadedB.preset) {
          throw new Error(`Stato preset divergente al frame ${frameIndex}.`);
        }
      }
      const samples = pcm(frameIndex);
      const [frameA, frameB] = await Promise.all([
        first.render({ width, height, steps: 1, channels: 2, samples }),
        second.render({ width, height, steps: 1, channels: 2, samples })
      ]);
      if (!frameA || !frameB) {
        throw new Error(`Framebuffer mancante al frame ${frameIndex}.`);
      }
      const bytesA = Buffer.from(
        frameA.bytes.buffer,
        frameA.bytes.byteOffset,
        frameA.bytes.byteLength
      );
      const bytesB = Buffer.from(
        frameB.bytes.buffer,
        frameB.bytes.byteOffset,
        frameB.bytes.byteLength
      );
      aggregateA.update(bytesA);
      aggregateB.update(bytesB);
      if (!bytesA.equals(bytesB)) {
        differences += 1;
        firstDifference ??= frameIndex;
      }
    }
    const hashA = aggregateA.digest("hex");
    const hashB = aggregateB.digest("hex");
    return {
      name,
      frames,
      differences,
      firstDifference,
      hashA,
      hashB,
      identical: differences === 0 && hashA === hashB,
      presetStates,
      elapsedMs: performance.now() - started
    };
  } finally {
    await Promise.all([first.shutdown(), second.shutdown()]);
  }
}

async function changedSeedCheck() {
  const presetName = "260-compshader-noise_lq.milk";
  const first = new ProjectMHostService(runtimePaths(presetName));
  const second = new ProjectMHostService(runtimePaths(presetName));
  try {
    await Promise.all([
      first.initialize(96, 128, 0x11223344),
      second.initialize(96, 128, 0x11223345)
    ]);
    const samples = sinePcm(0);
    const [frameA, frameB] = await Promise.all([
      first.render({ width: 96, height: 128, steps: 1, channels: 2, samples }),
      second.render({ width: 96, height: 128, steps: 1, channels: 2, samples })
    ]);
    const hashA = sha256(frameA.bytes);
    const hashB = sha256(frameB.bytes);
    return { presetName, hashA, hashB, different: hashA !== hashB };
  } finally {
    await Promise.all([first.shutdown(), second.shutdown()]);
  }
}

async function main() {
  for (const filePath of [
    ffmpeg,
    wavPath,
    ...presetNames.map((name) => path.join(presetRoot, name)),
    ...Object.values(runtimePaths(presetNames[0]))
  ]) {
    if (!fs.existsSync(filePath)) throw new Error(`Prerequisito mancante: ${filePath}`);
  }
  const decodedWav = decodeRealWav();
  const cases = [];
  cases.push(
    await comparePair({
      name: "silence-1-frame",
      frames: 1,
      seed: 0x51ed270b,
      pcm: () => new Float32Array(3200)
    })
  );
  cases.push(
    await comparePair({
      name: "sine-180-frames-resize-reset",
      frames: 180,
      seed: 0x51ed270b,
      pcm: sinePcm,
      exerciseControls: true
    })
  );
  cases.push(
    await comparePair({
      name: "real-wav-1800-frames-10-presets-transitions-textures",
      frames: 1800,
      seed: 0x51ed270b,
      pcm: (index) => wavPcm(decodedWav, index),
      exerciseControls: true
    })
  );
  const changedSeed = await changedSeedCheck();
  const report = {
    generatedAt: new Date().toISOString(),
    runtimeRoot,
    wavPath,
    presetRoot,
    projectMVersion: "4.1.6",
    protocolVersion: 2,
    seedEncoding: "uint64 little-endian",
    processesPerCase: 2,
    cases,
    changedSeed,
    passed: cases.every((entry) => entry.identical) && changedSeed.different
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
