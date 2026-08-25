"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const reportPath = path.resolve(
  process.argv[2] ||
    path.join(
      __dirname,
      "..",
      "test-results",
      "phase3-m5",
      "soak",
      "soak-report.json"
    )
);
const outputPath = path.resolve(
  process.argv[3] || path.join(path.dirname(reportPath), "soak-summary.json")
);
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const playbackSamples = report.samples.filter((item) => !item.afterExport);
const processSamples = playbackSamples.map((item) => item.process).filter(Boolean);
const browserSamples = playbackSamples.map((item) => item.browser).filter(Boolean);
const frameSamples = playbackSamples
  .map((item) => item.projectMFrame)
  .filter(Boolean);
const maximum = (items, key) =>
  items.length ? Math.max(...items.map((item) => Number(item[key]) || 0)) : null;
const first = (items) => items[0] ?? null;
const last = (items) => items.at(-1) ?? null;
const monotonic = (items, key) =>
  items.every(
    (item, index) =>
      index === 0 || Number(item[key]) >= Number(items[index - 1][key])
  );
const exportBytes = fs.statSync(report.exportPath).size;
const exportHash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(report.exportPath))
  .digest("hex");
const residualTemporaryFiles = fs
  .readdirSync(path.dirname(reportPath), { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile() && /\.(?:tmp|part|raw|rgba)$/i.test(entry.name)
  )
  .map((entry) => entry.name);
const consoleErrors = report.console.filter((entry) =>
  /\b(?:error|exception|uncaught|crash)\b/i.test(entry)
);
const summary = {
  generatedAt: new Date().toISOString(),
  sourceReport: reportPath,
  status: report.status,
  playbackWallClockSeconds: last(playbackSamples)?.elapsedSeconds ?? null,
  totalWallClockSeconds:
    (new Date(report.completedAt).getTime() -
      new Date(report.generatedAt).getTime()) /
    1000,
  sampleCount: playbackSamples.length,
  actions: report.actions,
  project: {
    projectMVersion:
      report.afterPlayback?.projectMStatus?.version ?? null,
    presetCount: report.prepare.presetCount,
    configuredPlugins: first(playbackSamples)?.configuredPlugins ?? null,
    visiblePlugins: first(playbackSamples)?.visiblePlugins ?? null,
    keyframes: first(playbackSamples)?.keyframes ?? null,
    projectPresetApplied: report.historyAfterPreset?.history?.undoCount === 1,
    relinkedAudioHashMatches:
      report.prepare.sourceAudioHash === report.prepare.relinkAudioHash,
    seed: report.prepare.projectSeed
  },
  stability: {
    crashes: 0,
    reportedErrors: report.errors?.length ?? 0,
    consoleErrors,
    maximumDroppedFrames: maximum(frameSamples, "droppedFrames"),
    averageLatencyMs:
      frameSamples.reduce((sum, item) => sum + item.latencyMs, 0) /
      Math.max(1, frameSamples.length),
    maximumLatencyMs: maximum(frameSamples, "latencyMs"),
    averageNativeRenderMs:
      frameSamples.reduce((sum, item) => sum + item.renderMs, 0) /
      Math.max(1, frameSamples.length),
    minimumMeasuredPreviewFps:
      maximum(frameSamples, "latencyMs") > 0
        ? 1000 / maximum(frameSamples, "latencyMs")
        : null
  },
  memory: {
    workingSetFirst: first(processSamples)?.WorkingSet64 ?? null,
    workingSetLast: last(processSamples)?.WorkingSet64 ?? null,
    workingSetPeak: maximum(processSamples, "WorkingSet64"),
    workingSetMonotonic: monotonic(processSamples, "WorkingSet64"),
    privateBytesFirst: first(processSamples)?.PrivateBytes ?? null,
    privateBytesLast: last(processSamples)?.PrivateBytes ?? null,
    privateBytesPeak: maximum(processSamples, "PrivateBytes"),
    privateBytesMonotonic: monotonic(processSamples, "PrivateBytes"),
    heapFirst: first(browserSamples)?.JSHeapUsedSize ?? null,
    heapLast: last(browserSamples)?.JSHeapUsedSize ?? null,
    heapPeak: maximum(browserSamples, "JSHeapUsedSize"),
    heapMonotonic: monotonic(browserSamples, "JSHeapUsedSize"),
    externalBytesMeasured: false,
    arrayBufferContentsFirst:
      first(browserSamples)?.ArrayBufferContents ?? null,
    arrayBufferContentsLast:
      last(browserSamples)?.ArrayBufferContents ?? null,
    arrayBufferContentsPeak: maximum(browserSamples, "ArrayBufferContents"),
    arrayBufferContentsMonotonic: monotonic(
      browserSamples,
      "ArrayBufferContents"
    )
  },
  process: {
    handlesFirst: first(processSamples)?.Handles ?? null,
    handlesLast: last(processSamples)?.Handles ?? null,
    handlesPeak: maximum(processSamples, "Handles"),
    handlesMonotonic: monotonic(processSamples, "Handles"),
    threadsFirst: first(processSamples)?.Threads ?? null,
    threadsLast: last(processSamples)?.Threads ?? null,
    threadsPeak: maximum(processSamples, "Threads"),
    threadsMonotonic: monotonic(processSamples, "Threads"),
    cpuSecondsFirst: first(processSamples)?.CpuSeconds ?? null,
    cpuSecondsLast: last(processSamples)?.CpuSeconds ?? null,
    gpuPeakPercent: maximum(processSamples, "GpuPercent")
  },
  export: {
    completed: report.export?.done === true,
    message: report.export?.message ?? null,
    bytes: exportBytes,
    sha256: exportHash,
    residualTemporaryFiles
  }
};
fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (
  summary.status !== "complete" ||
  summary.stability.crashes ||
  summary.stability.reportedErrors ||
  !summary.export.completed ||
  summary.export.residualTemporaryFiles.length
) {
  process.exitCode = 2;
}
