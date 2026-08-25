"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const mode = process.argv[2];
const port = Number(process.argv[3]);
const assetsPath = path.resolve(process.argv[4] || "");
const projectPath = path.resolve(process.argv[5] || "");
const reportPath = path.resolve(process.argv[6] || "");
const prepareReportPath = process.argv[7] ? path.resolve(process.argv[7]) : "";
const outputMp4 = process.argv[8] ? path.resolve(process.argv[8]) : "";
if (
  ![
    "prepare",
    "soak",
    "restore-only",
    "unicode-prepare",
    "unicode-reopen"
  ].includes(mode) ||
  !port ||
  !assetsPath ||
  !reportPath
) {
  throw new Error(
    "Uso: final-portable-demo-audit.cjs <prepare|soak|restore-only|unicode-prepare|unicode-reopen> <port> <assets> <project> <report> [prepareReport] [mp4]"
  );
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function target() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
        (response) => response.json()
      );
      const page = targets.find(
        (candidate) =>
          candidate.type === "page" && candidate.url.includes("index.html")
      );
      if (page) return page;
    } catch {
      // Portable may still be extracting.
    }
    await delay(250);
  }
  throw new Error("Pagina Portable non trovata.");
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
    this.console = [];
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      if (message.method === "Runtime.consoleAPICalled") {
        this.console.push(
          (message.params.args || [])
            .map((argument) => argument.value ?? argument.description ?? "")
            .join(" ")
        );
      }
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
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text
      );
    }
    return result.result.value;
  }
  close() {
    this.socket.close();
  }
}

async function waitFor(client, expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await client.evaluate(expression);
      if (value) return value;
    } catch {
      // Renderer may be reloading.
    }
    await delay(150);
  }
  throw new Error(`Timeout: ${label}`);
}

function processSample() {
  const command =
    "$p=Get-Process -ErrorAction SilentlyContinue|" +
    "Where-Object {$_.ProcessName -eq 'Audio Visualizer Studio' -or $_.ProcessName -eq 'projectm-host'};" +
    "$gpu=$null;try{$gpu=($v=(Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction Stop).CounterSamples.CookedValue|" +
    "Measure-Object -Maximum).Maximum}catch{};" +
    "[pscustomobject]@{At=(Get-Date).ToString('o');WorkingSet64=($p|Measure-Object WorkingSet64 -Sum).Sum;" +
    "PrivateMemorySize64=($p|Measure-Object PrivateMemorySize64 -Sum).Sum;" +
    "Handles=($p|Measure-Object HandleCount -Sum).Sum;CPU=($p|Measure-Object CPU -Sum).Sum;" +
    "ProcessCount=@($p).Count;GpuPercent=$gpu;Processes=@($p|ForEach-Object{" +
    "[pscustomobject]@{Id=$_.Id;Name=$_.ProcessName;WorkingSet64=$_.WorkingSet64;" +
    "PrivateMemorySize64=$_.PrivateMemorySize64;Handles=$_.HandleCount;CPU=$_.CPU;Path=$_.Path}})}|" +
    "ConvertTo-Json -Depth 5 -Compress";
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    { encoding: "utf8", timeout: 20_000 }
  );
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return null;
  }
}

async function persist(report) {
  await fsp.mkdir(path.dirname(reportPath), { recursive: true });
  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function capture(client, destination) {
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  await fsp.writeFile(destination, Buffer.from(shot.data, "base64"));
}

function restoreEvidence(snapshot) {
  const settings = snapshot.projectMSettings;
  return {
    seed: settings.randomSeed,
    playlistIds: settings.playlistIds,
    order: settings.autoSwitch.order,
    sequenceStartPresetId: settings.sequenceStartPresetId,
    currentPresetId: settings.presetId,
    history: settings.history,
    markers: settings.markers,
    locked: settings.locked,
    transition: settings.transition,
    autoSwitch: settings.autoSwitch,
    sequence: snapshot.presetSequence
      .filter((event) => event.time <= 600)
      .map((event) => ({
        ...event,
        order: settings.autoSwitch.order,
        transitionEnabled: settings.transition.enabled,
        transitionDurationSeconds: settings.transition.durationSeconds,
        marker:
          settings.markers.find(
            (marker) =>
              Math.abs(marker.time - event.time) < 1e-9 &&
              (marker.presetId === null || marker.presetId === event.presetId)
          ) ?? null,
        playlistIndex: settings.playlistIds.indexOf(event.presetId)
      }))
  };
}

async function prepare(client, assets) {
  await waitFor(
    client,
    "Boolean(window.avs && window.__avsRuntimeTest)",
    "API audit"
  );
  const imports = {};
  imports.single = await client.evaluate(
    `window.avs.presetImport({kind:"files",mode:"copy",auditPaths:${JSON.stringify(assets.imports.single)}})`
  );
  imports.multiple = await client.evaluate(
    `window.avs.presetImport({kind:"files",mode:"copy",auditPaths:${JSON.stringify(assets.imports.multiple)}})`
  );
  imports.folder = await client.evaluate(
    `window.avs.presetImport({kind:"folder",mode:"copy",auditPaths:[${JSON.stringify(assets.imports.folder)}]})`
  );
  imports.zip = await client.evaluate(
    `window.avs.presetImport({kind:"zip",mode:"copy",auditPaths:[${JSON.stringify(assets.imports.zip)}]})`
  );
  const expectedNames = assets.records.map((record) => record.name);
  const records = await client.evaluate("window.avs.presetList({})");
  const selected = expectedNames.map((name) =>
    records.find((record) => record.name === name)
  );
  if (selected.some((record) => !record)) {
    throw new Error("La demo non ha importato tutti i 10 preset.");
  }
  if (selected.some((record) => record.quarantined || record.status === "missing")) {
    throw new Error("Un preset della demo è in quarantena o mancante.");
  }

  await client.evaluate(
    `window.__avsRuntimeTest.loadAudio(${JSON.stringify(assets.audio600)})`
  );
  await client.evaluate(
    `window.__avsRuntimeTest.configureDemo(${JSON.stringify(assets.coverPath)},"Artista Audit","Titolo Audit Fase 2",30)`
  );
  const ids = selected.map((record) => record.id);
  await client.evaluate(
    `window.__avsRuntimeTest.setPlaylist(${JSON.stringify(ids)},${JSON.stringify(ids[0])})`
  );
  const directSelections = [];
  for (let index = 0; index < ids.length; index += 1) {
    const loaded = await client.evaluate(
      `window.__avsRuntimeTest.selectPreset(${JSON.stringify(ids[index])},${index === 0})`
    );
    await delay(180);
    const snapshot = await client.evaluate("window.__avsRuntimeTest.snapshot()");
    directSelections.push({
      id: ids[index],
      loaded,
      enginePreset: snapshot.projectMStatus?.preset,
      frameIndex: snapshot.projectMFrame?.frameIndex
    });
  }

  const manual = [];
  for (const command of ["previous", "next", "random", "restart"]) {
    await client.evaluate(
      `window.__avsRuntimeTest.presetCommand(${JSON.stringify(command)})`
    );
    await delay(220);
    const snapshot = await client.evaluate("window.__avsRuntimeTest.snapshot()");
    manual.push({
      command,
      presetId: snapshot.projectMSettings.presetId,
      presetName: snapshot.projectMSettings.presetName
    });
  }

  await client.evaluate("window.__avsRuntimeTest.setPresetAutomation(true,1,1511514634)");
  await client.evaluate("window.__avsRuntimeTest.setPresetLocked(true)");
  await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
  await delay(2300);
  const lockedSnapshot = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  await client.evaluate("window.__avsRuntimeTest.setPresetLocked(false)");
  await delay(2600);
  await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
  const unlockedSnapshot = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  const restoreAnchor = ids.find(
    (id) => id !== unlockedSnapshot.projectMSettings.presetId
  );
  if (!restoreAnchor) {
    throw new Error("Impossibile creare il caso startPreset diverso dal corrente.");
  }
  await client.evaluate(
    `window.__avsRuntimeTest.setRestoreAuditState(${JSON.stringify(restoreAnchor)})`
  );
  await client.evaluate("window.__avsRuntimeTest.setPresetAutomation(true,30,1511514634)");
  await client.evaluate("window.__avsRuntimeTest.setExportProfile(180,320,30)");
  const savedPath = await client.evaluate(
    `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
  );
  const snapshot = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  const screenshotPath = path.join(path.dirname(reportPath), "portable-demo-prepared.png");
  await capture(client, screenshotPath);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "prepare",
    assets,
    imports,
    libraryCount: records.length,
    selectedPresets: selected,
    directSelections,
    manual,
    lockedSnapshot,
    unlockedSnapshot,
    savedPath,
    snapshot,
    screenshotPath,
    console: client.console
  };
  await persist(report);
  return report;
}

async function soak(client, assets) {
  await waitFor(
    client,
    "Boolean(window.avs && window.__avsRuntimeTest)",
    "API audit"
  );
  const prepared = JSON.parse(await fsp.readFile(prepareReportPath, "utf8"));
  await client.evaluate(
    `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
  );
  await waitFor(
    client,
    "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
    "projectM dopo riapertura"
  );
  const reopened = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  const expectedRestore = restoreEvidence(prepared.snapshot);
  const actualRestore = restoreEvidence(reopened);
  const expectedSequence = expectedRestore.sequence;
  const actualSequence = actualRestore.sequence;
  const sameSeed =
    reopened.projectMSettings.randomSeed ===
    prepared.snapshot.projectMSettings.randomSeed;
  const initialSameSequence =
    JSON.stringify(actualSequence) === JSON.stringify(expectedSequence);
  const completeRestoreMatch =
    JSON.stringify(actualRestore) === JSON.stringify(expectedRestore);
  await client.evaluate(
    `window.__avsRuntimeTest.setPresetAutomation(` +
      `${reopened.projectMSettings.autoSwitch.enabled},` +
      `${reopened.projectMSettings.autoSwitch.intervalSeconds},` +
      `${reopened.projectMSettings.randomSeed})`
  );
  const rebuilt = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  const rebuiltSequence = restoreEvidence(rebuilt).sequence;
  const rebuiltSameSequence =
    JSON.stringify(rebuiltSequence) === JSON.stringify(expectedSequence);
  if (reopened.duration < 599.9) {
    throw new Error(`Durata WAV insufficiente: ${reopened.duration}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "soak",
    status: "playing",
    assets,
    projectPath,
    outputMp4,
    reopened,
    sameSeed,
    initialSameSequence,
    completeRestoreMatch,
    expectedRestore,
    actualRestore,
    rebuiltSameSequence,
    sequenceRebuiltByAudit: true,
    samples: [],
    errors: [],
    console: []
  };
  report.samples.push({
    elapsedSeconds: 0,
    playback: reopened,
    processes: processSample()
  });
  await persist(report);
  await client.evaluate("window.__avsRuntimeTest.seek(0)");
  await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
  const started = Date.now();
  let nextSample = 30;
  while ((Date.now() - started) / 1000 < 602) {
    await delay(1000);
    const elapsedSeconds = (Date.now() - started) / 1000;
    if (elapsedSeconds + 0.01 < nextSample) continue;
    const playback = await client.evaluate("window.__avsRuntimeTest.snapshot()");
    report.samples.push({
      elapsedSeconds,
      playback,
      processes: processSample()
    });
    report.console = [...client.console];
    await persist(report);
    nextSample += 30;
  }
  const afterPlayback = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  if (afterPlayback.playing) {
    await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
  }
  report.afterPlayback = afterPlayback;
  report.status = "exporting";
  await persist(report);
  const exportResult = await client.evaluate(
    `window.__avsRuntimeTest.exportAt(${JSON.stringify(outputMp4)})`
  );
  report.exportResult = exportResult;
  report.afterExport = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  report.samples.push({
    elapsedSeconds: (Date.now() - started) / 1000,
    playback: report.afterExport,
    processes: processSample()
  });
  report.console = [...client.console];
  report.status = "complete";
  const screenshotPath = path.join(path.dirname(reportPath), "portable-demo-after-10m.png");
  await capture(client, screenshotPath);
  report.screenshotPath = screenshotPath;
  await persist(report);
  return report;
}

async function restoreOnly(client, assets) {
  await waitFor(
    client,
    "Boolean(window.avs && window.__avsRuntimeTest)",
    "API audit"
  );
  const prepared = JSON.parse(await fsp.readFile(prepareReportPath, "utf8"));
  await client.evaluate(
    `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
  );
  await waitFor(
    client,
    "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
    "projectM dopo riapertura"
  );
  const reopened = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  const expectedRestore = restoreEvidence(prepared.snapshot);
  const actualRestore = restoreEvidence(reopened);
  await client.evaluate(
    `window.__avsRuntimeTest.setPresetAutomation(` +
      `${reopened.projectMSettings.autoSwitch.enabled},` +
      `${reopened.projectMSettings.autoSwitch.intervalSeconds},` +
      `${reopened.projectMSettings.randomSeed})`
  );
  const rebuilt = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  const rebuiltRestore = restoreEvidence(rebuilt);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "restore-only",
    assetsPath,
    projectPath,
    sameSeed:
      reopened.projectMSettings.randomSeed ===
      prepared.snapshot.projectMSettings.randomSeed,
    completeRestoreMatch:
      JSON.stringify(actualRestore) === JSON.stringify(expectedRestore),
    rebuiltSameSequence:
      JSON.stringify(rebuiltRestore.sequence) ===
      JSON.stringify(expectedRestore.sequence),
    expectedRestore,
    actualRestore,
    rebuiltRestore,
    projectMStatus: reopened.projectMStatus,
    console: client.console
  };
  await persist(report);
  return report;
}

async function unicodePrepare(client, assets) {
  await waitFor(
    client,
    "Boolean(window.avs && window.__avsRuntimeTest)",
    "API audit Unicode"
  );
  const imports = [];
  for (const item of assets.cases) {
    const copied = await client.evaluate(
      `window.avs.presetImport({kind:"folder",mode:"copy",auditPaths:[${JSON.stringify(item.copyDirectory)}]})`
    );
    const linked = await client.evaluate(
      `window.avs.presetImport({kind:"folder",mode:"link",auditPaths:[${JSON.stringify(item.linkDirectory)}]})`
    );
    if (
      copied.imported.length !== 1 ||
      linked.imported.length !== 1 ||
      copied.issues.length ||
      linked.issues.length ||
      copied.imported[0].missingTextures.length ||
      linked.imported[0].missingTextures.length
    ) {
      throw new Error(
        `Import Unicode non valido per ${item.label}: ${JSON.stringify({ copied, linked })}`
      );
    }
    imports.push({ label: item.label, copied, linked });
  }
  await client.evaluate(
    `window.__avsRuntimeTest.loadAudio(${JSON.stringify(assets.audioPath)})`
  );
  const linkedRecords = imports.map((item) => item.linked.imported[0]);
  const ids = linkedRecords.map((record) => record.id);
  await client.evaluate(
    `window.__avsRuntimeTest.setPlaylist(${JSON.stringify(ids)},${JSON.stringify(ids[0])})`
  );
  await client.evaluate(
    "window.__avsRuntimeTest.setPresetAutomation(true,1,3237998146)"
  );
  const selections = [];
  for (const [index, record] of linkedRecords.entries()) {
    const loaded = await client.evaluate(
      `window.__avsRuntimeTest.selectPreset(${JSON.stringify(record.id)},${index === 0})`
    );
    await delay(180);
    const snapshot = await client.evaluate("window.__avsRuntimeTest.snapshot()");
    const status = snapshot.projectMStatus;
    selections.push({
      id: record.id,
      expectedPath: record.path,
      loaded,
      receivedPath: status?.receivedPresetPath,
      utf8Bytes: status?.presetPathUtf8Bytes,
      expectedUtf8Bytes: Buffer.byteLength(record.path, "utf8"),
      activeCodePage: status?.activeCodePage,
      frameIndex: snapshot.projectMFrame?.frameIndex
    });
  }
  if (
    selections.some(
      (item) =>
        !item.loaded ||
        item.receivedPath !== item.expectedPath ||
        item.utf8Bytes !== item.expectedUtf8Bytes ||
        item.activeCodePage !== 65001 ||
        item.frameIndex === undefined
    )
  ) {
    throw new Error(`Selezione Unicode alterata: ${JSON.stringify(selections)}`);
  }
  const current = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  const anchor = ids.find(
    (id) => id !== current.projectMSettings.presetId
  );
  if (!anchor) throw new Error("Anchor Unicode distinto non disponibile.");
  await client.evaluate(
    `window.__avsRuntimeTest.setRestoreAuditState(${JSON.stringify(anchor)})`
  );
  await client.evaluate("window.__avsRuntimeTest.setExportProfile(180,320,30)");
  await client.evaluate(
    `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
  );
  const snapshot = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "unicode-prepare",
    assets,
    imports,
    selections,
    snapshot,
    console: client.console
  };
  await persist(report);
  return report;
}

async function unicodeReopen(client, assets) {
  await waitFor(
    client,
    "Boolean(window.avs && window.__avsRuntimeTest)",
    "API audit Unicode"
  );
  const prepared = JSON.parse(await fsp.readFile(prepareReportPath, "utf8"));
  await client.evaluate(
    `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
  );
  await waitFor(
    client,
    "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
    "projectM Unicode dopo riapertura"
  );
  const reopened = await client.evaluate("window.__avsRuntimeTest.snapshot()");
  const expectedRestore = restoreEvidence(prepared.snapshot);
  const actualRestore = restoreEvidence(reopened);
  const records = await client.evaluate("window.avs.presetList({})");
  const relinkAndLoad = [];
  for (const item of assets.cases) {
    const record = records.find((candidate) => candidate.path === item.linkPath);
    if (!record) {
      throw new Error(`Preset collegato non persistito: ${item.linkPath}`);
    }
    const relinked = await client.evaluate(
      `window.avs.presetRelink({id:${JSON.stringify(record.id)},candidatePath:${JSON.stringify(item.linkPath)}})`
    );
    const loaded = await client.evaluate(
      `window.__avsRuntimeTest.selectPreset(${JSON.stringify(record.id)})`
    );
    await delay(180);
    const snapshot = await client.evaluate("window.__avsRuntimeTest.snapshot()");
    relinkAndLoad.push({
      label: item.label,
      id: record.id,
      relinkedPath: relinked?.path,
      loaded,
      receivedPath: snapshot.projectMStatus?.receivedPresetPath,
      activeCodePage: snapshot.projectMStatus?.activeCodePage,
      frameIndex: snapshot.projectMFrame?.frameIndex
    });
  }
  if (
    relinkAndLoad.some(
      (item, index) =>
        item.relinkedPath !== assets.cases[index].linkPath ||
        !item.loaded ||
        item.receivedPath !== assets.cases[index].linkPath ||
        item.activeCodePage !== 65001 ||
        item.frameIndex === undefined
    )
  ) {
    throw new Error(
      `Riapertura/ricollegamento Unicode alterato: ${JSON.stringify(relinkAndLoad)}`
    );
  }
  const linkedIds = relinkAndLoad.map((item) => item.id);
  await client.evaluate(
    `window.__avsRuntimeTest.setPlaylist(${JSON.stringify(linkedIds)},${JSON.stringify(linkedIds[0])})`
  );
  await client.evaluate(
    "window.__avsRuntimeTest.setPresetAutomation(true,1,3237998146)"
  );
  await client.evaluate("window.__avsRuntimeTest.setExportProfile(180,320,30)");
  const exportResult = await client.evaluate(
    `window.__avsRuntimeTest.exportAt(${JSON.stringify(outputMp4)})`
  );
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "unicode-reopen",
    completeRestoreMatch:
      JSON.stringify(actualRestore) === JSON.stringify(expectedRestore),
    expectedRestore,
    actualRestore,
    relinkAndLoad,
    exportResult,
    outputMp4,
    outputBytes: (await fsp.stat(outputMp4)).size,
    console: client.console
  };
  await persist(report);
  return report;
}

async function main() {
  const assets = JSON.parse(await fsp.readFile(assetsPath, "utf8"));
  const page = await target();
  const client = new Cdp(page.webSocketDebuggerUrl);
  await client.open();
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    const report =
      mode === "prepare"
        ? await prepare(client, assets)
        : mode === "soak"
          ? await soak(client, assets)
          : mode === "restore-only"
            ? await restoreOnly(client, assets)
            : mode === "unicode-prepare"
              ? await unicodePrepare(client, assets)
              : await unicodeReopen(client, assets);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    try {
      await client.evaluate("window.avs.projectMShutdown()");
    } catch {
      // App may already be closing.
    }
    try {
      await client.evaluate("window.close()");
    } catch {
      // Window may already be closed.
    }
    client.close();
  }
}

main().catch(async (error) => {
  const failure = {
    generatedAt: new Date().toISOString(),
    mode,
    status: "failed",
    error: error instanceof Error ? error.stack || error.message : String(error)
  };
  try {
    await persist(failure);
  } catch {
    // Preserve the original error.
  }
  console.error(error);
  process.exitCode = 1;
});
