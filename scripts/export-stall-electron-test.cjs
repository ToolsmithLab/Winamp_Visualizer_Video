"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const [
  ,
  ,
  portArgument,
  shortAudioArgument,
  fullAudioArgument,
  coverArgument,
  outputDirectoryArgument,
  reportArgument,
  presetOneArgument,
  presetTwoArgument
] = process.argv;

const port = Number(portArgument || 9394);
const shortAudioPath = path.resolve(shortAudioArgument);
const fullAudioPath = path.resolve(fullAudioArgument);
const coverPath = path.resolve(coverArgument);
const outputDirectory = path.resolve(outputDirectoryArgument);
const reportPath = path.resolve(reportArgument);
const presetPaths = [path.resolve(presetOneArgument), path.resolve(presetTwoArgument)];
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

class Client {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text
      );
    }
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function findTarget() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find(
        (candidate) =>
          candidate.type === "page" && candidate.url.includes("runtimeTest=1")
      );
      if (target) return target;
    } catch {}
    await delay(200);
  }
  throw new Error("Renderer Electron runtime non trovato.");
}

async function waitFor(client, expression, label, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
}

function expression(value) {
  return JSON.stringify(value);
}

function summarizeProgress(history) {
  const firstFrame = history.find((event) => (event.frameCurrent || 0) >= 1);
  const ffmpegStarted = history.find(
    (event) =>
      event.phase === "encoding" &&
      (event.frameCurrent || 0) === 0
  );
  const firstNonZero = history.find((event) => event.percent > 0);
  const done = history.findLast((event) => event.done);
  return {
    eventCount: history.length,
    firstFrameSeconds: firstFrame?.elapsedSeconds ?? null,
    ffmpegStartSeconds: ffmpegStarted?.elapsedSeconds ?? null,
    firstNonZeroPercent: firstNonZero?.percent ?? null,
    finalPercent: done?.percent ?? null,
    frames: done?.frameCurrent ?? firstFrame?.frameTotal ?? null,
    frameTotal: done?.frameTotal ?? firstFrame?.frameTotal ?? null,
    framesPerSecond: done?.framesPerSecond ?? null,
    elapsedSeconds: done?.elapsedSeconds ?? null,
    phaseSequence: [...new Set(history.map((event) => event.phase).filter(Boolean))],
    videoCodec: done?.videoCodec ?? firstNonZero?.videoCodec ?? null,
    audioCodec: done?.audioCodec ?? firstNonZero?.audioCodec ?? null,
    encoder: done?.encoder ?? firstNonZero?.encoder ?? null,
    ffmpegPath: done?.ffmpegPath ?? firstNonZero?.ffmpegPath ?? null,
    openH264Path: done?.openH264Path ?? firstNonZero?.openH264Path ?? null,
    diagnosticLogPath:
      done?.diagnosticLogPath ?? firstNonZero?.diagnosticLogPath ?? null,
    error: done?.error ?? null
  };
}

async function configure(client, options) {
  await client.evaluate(
    `window.__avsRuntimeTest.configureExportAudit(${expression(options)})`
  );
  await client.evaluate("window.__avsRuntimeTest.setExportProfile(180,320,30)");
}

async function runExport(client, scenario) {
  await configure(client, {
    audioPath: scenario.fullDuration ? fullAudioPath : shortAudioPath,
    coverPath: scenario.cover ? coverPath : null,
    title: scenario.title || "",
    artist: scenario.artist || "",
    effect: scenario.effect,
    effectOpacity: scenario.opacity
  });
  if (scenario.presetId) {
    const selected = await client.evaluate(
      `window.__avsRuntimeTest.selectPreset(${expression(scenario.presetId)}, true)`
    );
    if (!selected) throw new Error(`Preset non selezionato: ${scenario.presetId}`);
  }
  await client.evaluate("window.__avsRuntimeTest.clearExportProgressHistory()");
  const outputPath = path.join(outputDirectory, `${scenario.id}.mp4`);
  const started = Date.now();
  const result = await client.evaluate(
    `window.__avsRuntimeTest.exportAt(${expression(outputPath)})`
  );
  const history = await client.evaluate(
    "window.__avsRuntimeTest.exportProgressHistory()"
  );
  const summary = summarizeProgress(history);
  const stat = await fs.stat(outputPath);
  if (!result?.done || result?.percent !== 100 || !stat.size) {
    throw new Error(`Export incompleto: ${scenario.id}`);
  }
  return {
    ...scenario,
    outputPath,
    outputBytes: stat.size,
    wallSeconds: (Date.now() - started) / 1000,
    ...summary
  };
}

async function runCancel(client, presetId) {
  await configure(client, {
    audioPath: fullAudioPath,
    coverPath,
    title: "INDUSTRIAL STRENGTH",
    artist: "Extreme Hybrid Wrestling",
    effect: "projectM",
    effectOpacity: 0.55
  });
  await client.evaluate(
    `window.__avsRuntimeTest.selectPreset(${expression(presetId)}, true)`
  );
  await client.evaluate("window.__avsRuntimeTest.clearExportProgressHistory()");
  const outputPath = path.join(outputDirectory, "cancelled.mp4");
  await client.evaluate(
    `window.__avsRuntimeTest.startExportAt(${expression(outputPath)})`
  );
  await waitFor(
    client,
    "window.__avsRuntimeTest.exportProgressHistory().some((event) => (event.frameCurrent || 0) >= 1)",
    "primo frame prima dell'annullamento",
    90_000
  );
  const accepted = await client.evaluate(
    "window.__avsRuntimeTest.cancelExportJob()"
  );
  await waitFor(
    client,
    "window.__avsRuntimeTest.exportProgressHistory().some((event) => event.done && event.cancelled)",
    "evento annullamento",
    30_000
  );
  await delay(750);
  const history = await client.evaluate(
    "window.__avsRuntimeTest.exportProgressHistory()"
  );
  let outputExists = true;
  try {
    await fs.access(outputPath);
  } catch {
    outputExists = false;
  }
  return {
    accepted,
    outputRemoved: !outputExists,
    ...summarizeProgress(history)
  };
}

async function main() {
  await fs.mkdir(outputDirectory, { recursive: true });
  const startedAt = Date.now();
  let client;
  const report = {
    generatedAt: new Date().toISOString(),
    passed: false,
    scenarios: [],
    cancellation: null,
    importedPresets: [],
    error: null
  };
  try {
    const target = await findTarget();
    client = new Client(target.webSocketDebuggerUrl);
    await client.open();
    await client.send("Runtime.enable");
    await waitFor(
      client,
      "Boolean(window.avs && window.__avsRuntimeTest)",
      "API runtime"
    );
    const imported = await client.evaluate(
      `window.__avsRuntimeTest.importSimplePresetsAt("files","copy",${expression(presetPaths)})`
    );
    const state = await client.evaluate(
      "window.__avsRuntimeTest.simplePresetLibraryState()"
    );
    const importedRecords = state.records.filter((record) =>
      presetPaths.some(
        (presetPath) =>
          record.sourcePath?.toLowerCase() === presetPath.toLowerCase() ||
          record.path?.toLowerCase().endsWith(path.basename(presetPath).toLowerCase())
      )
    );
    report.importedPresets = importedRecords;
    const presetOne = importedRecords.find((record) =>
      record.path.toLowerCase().endsWith(path.basename(presetPaths[0]).toLowerCase())
    )?.id;
    const presetTwo = importedRecords.find((record) =>
      record.path.toLowerCase().endsWith(path.basename(presetPaths[1]).toLowerCase())
    )?.id;
    if (!imported || !presetOne || !presetTwo) {
      throw new Error("Due preset projectM reali non importati.");
    }

    const scenarios = [
      { id: "01-image-audio", cover: true, effect: "none" },
      {
        id: "02-image-text",
        cover: true,
        title: "INDUSTRIAL STRENGTH",
        artist: "Extreme Hybrid Wrestling",
        effect: "none"
      },
      {
        id: "03-image-canvas",
        cover: true,
        title: "INDUSTRIAL STRENGTH",
        artist: "Extreme Hybrid Wrestling",
        effect: "spectrumBars"
      },
      {
        id: "04-image-projectm",
        cover: true,
        title: "INDUSTRIAL STRENGTH",
        artist: "Extreme Hybrid Wrestling",
        effect: "projectM",
        presetId: presetOne
      },
      {
        id: "05-projectm-transparent",
        cover: true,
        title: "INDUSTRIAL STRENGTH",
        artist: "Extreme Hybrid Wrestling",
        effect: "projectM",
        opacity: 0.45,
        presetId: presetOne
      },
      {
        id: "06-projectm-no-image",
        cover: false,
        title: "",
        artist: "",
        effect: "projectM",
        presetId: presetOne
      },
      {
        id: "07-projectm-other-preset",
        cover: true,
        title: "Preset alternativo",
        artist: "Extreme Hybrid Wrestling",
        effect: "projectM",
        presetId: presetTwo
      },
      {
        id: "08-effect-disabled",
        cover: true,
        title: "Effetto disattivato",
        artist: "Extreme Hybrid Wrestling",
        effect: "none"
      },
      {
        id: "09-user-project-full",
        cover: true,
        title: "INDUSTRIAL STRENGTH (MANUFACTURING ELECTRIC)",
        artist: "Extreme Hybrid Wrestling",
        effect: "projectM",
        opacity: 0.55,
        presetId: presetTwo,
        fullDuration: true
      }
    ];

    for (const scenario of scenarios) {
      const result = await runExport(client, scenario);
      report.scenarios.push(result);
      await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    report.cancellation = await runCancel(client, presetOne);
    if (!report.cancellation.accepted || !report.cancellation.outputRemoved) {
      throw new Error("Annullamento o cleanup incompleto.");
    }
    report.passed = true;
    report.elapsedSeconds = (Date.now() - startedAt) / 1000;
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await client.evaluate("window.close()");
  } catch (error) {
    report.error = error instanceof Error ? error.stack || error.message : String(error);
    report.elapsedSeconds = (Date.now() - startedAt) / 1000;
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    throw error;
  } finally {
    client?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
