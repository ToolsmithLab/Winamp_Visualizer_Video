"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const port = Number(process.argv[2] || 9340);
const legacyPath = path.resolve(process.argv[3]);
const savedPath = path.resolve(process.argv[4]);
const audioPath = path.resolve(process.argv[5]);
const exportPath = path.resolve(process.argv[6]);
const reportPath = path.resolve(process.argv[7]);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
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
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find(
        (candidate) =>
          candidate.type === "page" && candidate.url.includes("runtimeTest=1")
      );
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw lastError || new Error("Renderer Electron non trovato.");
}

async function waitFor(client, predicate, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await client.evaluate(predicate);
    if (value) return;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
}

async function snapshot(client) {
  return client.evaluate("window.__avsRuntimeTest.snapshot()");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  for (const required of [legacyPath, audioPath]) {
    await fs.access(required);
  }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const stagedLegacyPath = `${savedPath}.input-v5.avsproject`;
  const bundledPresetPath = path.resolve(
    "assets",
    "projectm",
    "presets",
    "AVS Audio Wave.milk"
  );
  const bundledPresetHash = crypto
    .createHash("sha256")
    .update(await fs.readFile(bundledPresetPath))
    .digest("hex");
  const stagedLegacy = JSON.parse(await fs.readFile(legacyPath, "utf8"));
  stagedLegacy.audioFile = audioPath;
  stagedLegacy.cover.filePath = null;
  stagedLegacy.projectM.presetId = "bundled-audio-wave";
  stagedLegacy.projectM.presetPath = bundledPresetPath;
  stagedLegacy.projectM.presetHash = bundledPresetHash;
  stagedLegacy.projectM.presetName = "AVS Audio Wave";
  stagedLegacy.projectM.presetStatus = "valid";
  stagedLegacy.projectM.presetLicense = "LGPL-2.1-or-later";
  stagedLegacy.projectM.presetLicenseVerified = true;
  stagedLegacy.projectM.texturePaths = [];
  stagedLegacy.projectM.missingTextures = [];
  stagedLegacy.projectM.playlistIds = ["bundled-audio-wave"];
  stagedLegacy.projectM.sequenceStartPresetId = "bundled-audio-wave";
  await fs.writeFile(
    stagedLegacyPath,
    `${JSON.stringify(stagedLegacy, null, 2)}\n`
  );
  const target = await findTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  const checkpoints = {};
  try {
    await client.send("Runtime.enable");
    await waitFor(
      client,
      "Boolean(window.__avsRuntimeTest)",
      "API runtime M1"
    );
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
      "projectM disponibile"
    );

    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(stagedLegacyPath)})`
    );
    checkpoints.openedLegacy = await snapshot(client);
    assert(
      checkpoints.openedLegacy.project.version === "6.0",
      "Il progetto 5.0 non è stato migrato a 6.0."
    );
    assert(
      checkpoints.openedLegacy.history.history.undoCount === 0 &&
        !checkpoints.openedLegacy.isDirty,
      "Apri progetto non ha azzerato history/dirty state."
    );

    await client.evaluate(
      "window.__avsRuntimeTest.selectPreset('bundled-audio-wave', true)"
    );
    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(savedPath)})`
    );
    checkpoints.savedBaseline = await snapshot(client);
    assert(!checkpoints.savedBaseline.isDirty, "Save non ha aggiornato saved revision.");

    await client.evaluate(`(() => {
      document.querySelector('[data-layer-id="visualizer-spectrumBars"]').click();
      const slider = document.querySelector('#layer-opacity');
      slider.value = '37';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    checkpoints.edited = await snapshot(client);
    assert(checkpoints.edited.isDirty, "La modifica proprietà non rende dirty.");
    assert(
      checkpoints.edited.history.history.undoCount ===
        checkpoints.savedBaseline.history.history.undoCount + 1,
      "Lo slider non è stato coalesciato in un comando."
    );

    await client.evaluate("document.querySelector('#undo-command').click()");
    checkpoints.undoButton = await snapshot(client);
    assert(!checkpoints.undoButton.isDirty, "Undo al saved revision resta dirty.");

    await client.evaluate(
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true}))"
    );
    checkpoints.redoShortcut = await snapshot(client);
    assert(checkpoints.redoShortcut.isDirty, "Ctrl+Y non ha eseguito redo.");

    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(savedPath)})`
    );
    checkpoints.savedEdited = await snapshot(client);
    assert(!checkpoints.savedEdited.isDirty, "Save dopo redo resta dirty.");
    assert(
      checkpoints.savedEdited.history.history.undoCount > 0,
      "Save ha cancellato la history."
    );

    await client.evaluate(
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))"
    );
    checkpoints.undoShortcut = await snapshot(client);
    assert(checkpoints.undoShortcut.isDirty, "Ctrl+Z dopo save non rende dirty.");
    await client.evaluate(
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true}))"
    );
    checkpoints.redoShiftShortcut = await snapshot(client);
    assert(!checkpoints.redoShiftShortcut.isDirty, "Ctrl+Shift+Z non ripristina saved revision.");

    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(savedPath)})`
    );
    checkpoints.reopened = await snapshot(client);
    assert(
      !checkpoints.reopened.isDirty &&
        checkpoints.reopened.history.history.undoCount === 0,
      "Riapertura non azzera history/dirty."
    );

    await client.evaluate(
      `window.__avsRuntimeTest.loadAudio(${JSON.stringify(audioPath)})`
    );
    await client.evaluate("window.__avsRuntimeTest.setExportProfile(360,640,30)");
    checkpoints.beforeExport = await snapshot(client);
    const exportResult = await client.evaluate(
      `window.__avsRuntimeTest.exportAt(${JSON.stringify(exportPath)})`
    );
    const exported = await fs.stat(exportPath);
    assert(exported.size > 0, "Export MP4 vuoto.");

    const savedDocument = JSON.parse(await fs.readFile(savedPath, "utf8"));
    assert(savedDocument.version === "6.0", "La copia salvata non è schema 6.0.");
    const report = {
      generatedAt: new Date().toISOString(),
      target: { title: target.title, url: target.url },
      legacyPath,
      stagedLegacyPath,
      savedPath,
      audioPath,
      exportPath,
      exportBytes: exported.size,
      exportResult,
      assertions: {
        migration5To6: true,
        historyResetOnOpen: true,
        sliderSingleCommand: true,
        undoButton: true,
        redoCtrlY: true,
        undoCtrlZ: true,
        redoCtrlShiftZ: true,
        saveKeepsHistory: true,
        dirtyRevision: true,
        reopen: true,
        mp4Export: true
      },
      checkpoints: Object.fromEntries(
        Object.entries(checkpoints).map(([key, value]) => [
          key,
          {
            version: value.project.version,
            dirty: value.isDirty,
            revision: value.history.revision,
            savedRevision: value.history.savedRevision,
            undoCount: value.history.history.undoCount,
            redoCount: value.history.history.redoCount
          }
        ])
      )
    };
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    try {
      await client.evaluate("window.avs.projectMShutdown()");
      await client.evaluate("window.close()");
    } catch {
      // The application may already be closing.
    }
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
