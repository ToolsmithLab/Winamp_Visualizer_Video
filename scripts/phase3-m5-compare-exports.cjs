"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const firstReportPath = path.resolve(process.argv[2] || "");
const secondReportPath = path.resolve(process.argv[3] || "");
const outputPath = path.resolve(
  process.argv[4] ||
    path.join(root, "test-results", "phase3-m5", "export-determinism.json")
);
const ffmpeg = path.join(root, "native", "ffmpeg", "win-x64", "ffmpeg.exe");
if (!firstReportPath || !secondReportPath) {
  throw new Error(
    "Uso: phase3-m5-compare-exports.cjs <report-a> <report-b> [output]"
  );
}

function sha256(filePathOrBytes) {
  return crypto
    .createHash("sha256")
    .update(
      Buffer.isBuffer(filePathOrBytes)
        ? filePathOrBytes
        : fs.readFileSync(filePathOrBytes)
    )
    .digest("hex");
}

function compareFiles(first, second) {
  const firstHash = sha256(first);
  const secondHash = sha256(second);
  return {
    first,
    second,
    firstHash,
    secondHash,
    identical: firstHash === secondHash
  };
}

function comparisonMap(report) {
  return new Map(
    report.comparisons.map((item) => [Number(item.timestamp), item])
  );
}

function normalizedRequirements(value) {
  const copy = structuredClone(value);
  delete copy.rawProjectMFrames;
  return copy;
}

function ffmpegDigest(filePath, stream) {
  const arguments_ =
    stream === "video"
      ? [
          "-v",
          "error",
          "-i",
          filePath,
          "-map",
          "0:v:0",
          "-an",
          "-f",
          "framemd5",
          "-hash",
          "sha256",
          "pipe:1"
        ]
      : [
          "-v",
          "error",
          "-i",
          filePath,
          "-map",
          "0:a:0",
          "-vn",
          "-c:a",
          "pcm_f32le",
          "-f",
          "hash",
          "-hash",
          "sha256",
          "pipe:1"
        ];
  const result = spawnSync(ffmpeg, arguments_, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `FFmpeg digest ${stream} fallito.`);
  }
  return {
    hash: sha256(Buffer.from(result.stdout, "utf8")),
    value: result.stdout.trim()
  };
}

function compareHashSequences(firstHashes, secondHashes) {
  const firstSequence = Array.isArray(firstHashes) ? firstHashes : [];
  const secondSequence = Array.isArray(secondHashes) ? secondHashes : [];
  const maximum = Math.max(firstSequence.length, secondSequence.length);
  const mismatchIndices = [];
  for (let index = 0; index < maximum; index += 1) {
    if (firstSequence[index] !== secondSequence[index]) {
      mismatchIndices.push(index);
    }
  }
  return {
    firstCount: firstSequence.length,
    secondCount: secondSequence.length,
    mismatchCount: mismatchIndices.length,
    firstMismatch: mismatchIndices[0] ?? null,
    identical:
      firstSequence.length > 0 &&
      firstSequence.length === secondSequence.length &&
      mismatchIndices.length === 0,
    firstSequenceHash: sha256(Buffer.from(firstSequence.join("\n"), "utf8")),
    secondSequenceHash: sha256(Buffer.from(secondSequence.join("\n"), "utf8"))
  };
}

const first = JSON.parse(fs.readFileSync(firstReportPath, "utf8"));
const second = JSON.parse(fs.readFileSync(secondReportPath, "utf8"));
const secondByTime = comparisonMap(second);
const captures = first.comparisons.map((item) => {
  const peer = secondByTime.get(Number(item.timestamp));
  if (!peer) {
    return { timestamp: item.timestamp, missing: true, identical: false };
  }
  const preview = compareFiles(item.previewFrame, peer.previewFrame);
  const firstProjectM = path.join(
    path.dirname(firstReportPath),
    `projectm-${Number(item.timestamp).toFixed(3)}.png`
  );
  const secondProjectM = path.join(
    path.dirname(secondReportPath),
    `projectm-${Number(item.timestamp).toFixed(3)}.png`
  );
  return {
    timestamp: item.timestamp,
    frameIndex: item.frameIndex,
    preview,
    projectM:
      fs.existsSync(firstProjectM) && fs.existsSync(secondProjectM)
        ? compareFiles(firstProjectM, secondProjectM)
        : null,
    identical: preview.identical
  };
});
const firstVideo = compareFiles(first.output, second.output);
const preEncodingFrames = compareHashSequences(
  first.preEncodingFrameHashes,
  second.preEncodingFrameHashes
);
const projectMFrames = compareHashSequences(
  first.projectMFrameHashes,
  second.projectMFrameHashes
);
const decodedVideoA = ffmpegDigest(first.output, "video");
const decodedVideoB = ffmpegDigest(second.output, "video");
const decodedAudioA = ffmpegDigest(first.output, "audio");
const decodedAudioB = ffmpegDigest(second.output, "audio");
const structural = {
  profile: JSON.stringify(first.profile) === JSON.stringify(second.profile),
  frames: first.frames === second.frames,
  fps: first.fps === second.fps,
  duration: first.durationSeconds === second.durationSeconds,
  sequence: JSON.stringify(first.sequence) === JSON.stringify(second.sequence),
  presetChanges: first.presetChanges === second.presetChanges,
  failedChanges: first.failedChanges === second.failedChanges,
  referenceRequirements:
    JSON.stringify(normalizedRequirements(first.referenceRequirements)) ===
    JSON.stringify(normalizedRequirements(second.referenceRequirements))
};
const report = {
  generatedAt: new Date().toISOString(),
  firstReportPath,
  secondReportPath,
  structural,
  structuralMatch: Object.values(structural).every(Boolean),
  preEncodingIdentical: preEncodingFrames.identical,
  projectMFramebuffersIdentical: projectMFrames.identical,
  preEncodingFrames,
  projectMFrames,
  decodedVideo: {
    firstHash: decodedVideoA.hash,
    secondHash: decodedVideoB.hash,
    identical: decodedVideoA.value === decodedVideoB.value
  },
  decodedAudio: {
    firstHash: decodedAudioA.hash,
    secondHash: decodedAudioB.hash,
    identical: decodedAudioA.value === decodedAudioB.value
  },
  identicalCaptureCount: captures.filter((item) => item.identical).length,
  captureCount: captures.length,
  projectMIdenticalCount: captures.filter(
    (item) => item.projectM?.identical === true
  ).length,
  video: firstVideo,
  captures
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(
  `${JSON.stringify({
    structural: report.structural,
    structuralMatch: report.structuralMatch,
    preEncodingIdentical: report.preEncodingIdentical,
    identicalCaptureCount: report.identicalCaptureCount,
    captureCount: report.captureCount,
    projectMIdenticalCount: report.projectMIdenticalCount,
    preEncodingFrames: report.preEncodingFrames,
    projectMFrames: report.projectMFrames,
    decodedVideo: report.decodedVideo,
    decodedAudio: report.decodedAudio,
    videoIdentical: report.video.identical,
    firstVideoHash: report.video.firstHash,
    secondVideoHash: report.video.secondHash
  }, null, 2)}\n`
);
if (
  !report.structuralMatch ||
  !report.preEncodingIdentical ||
  !report.projectMFramebuffersIdentical ||
  !report.decodedVideo.identical ||
  !report.decodedAudio.identical
) {
  process.exitCode = 2;
}
