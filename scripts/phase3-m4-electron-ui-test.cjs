"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.argv[2] || 9344);
const sourceAudio = path.resolve(process.argv[3]);
const sourceCover = path.resolve(process.argv[4]);
const outputRoot = path.resolve(process.argv[5]);
const reportPath = path.join(outputRoot, "runtime-report.json");
const screenshotPath = path.join(outputRoot, "runtime-ui.png");
const projectPath = path.join(outputRoot, "M4 progetto Ω.avsproject");
const exportedPresetPath = path.join(outputRoot, "M4 configurazione Ω.avspreset");
const videoPath = path.join(outputRoot, "M4 export 180x320.mp4");
const mediaDirectory = path.join(outputRoot, "media Ω");
const movedDirectory = path.join(outputRoot, "ricollegati 日本語");
const audioPath = path.join(mediaDirectory, "brano 60s Ω.wav");
const coverPath = path.join(mediaDirectory, "copertina Ω.png");
const movedAudioPath = path.join(movedDirectory, "brano 60s Ω.wav");
const originalCoverBackup = path.join(movedDirectory, "copertina originale Ω.png");
const mismatchCoverPath = path.join(movedDirectory, "copertina hash diverso Ω.png");
const milkdropFixtures = [
  path.join(__dirname, "..", "tests", "fixtures", "preset-import", "parity-one.milk"),
  path.join(__dirname, "..", "tests", "fixtures", "preset-import", "parity-two.milk"),
  path.join(__dirname, "..", "tests", "fixtures", "preset-import", "parity-third.milk")
];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function findTarget() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find(
        (candidate) =>
          candidate.type === "page" && candidate.url.includes("runtimeTest=1")
      );
      if (page) return page;
    } catch {}
    await delay(200);
  }
  throw new Error("Renderer Electron M4 non trovato.");
}

async function waitFor(client, expression, label, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
}

function check(value, message) {
  if (!value) throw new Error(message);
}

async function main() {
  await fs.mkdir(mediaDirectory, { recursive: true });
  await fs.mkdir(movedDirectory, { recursive: true });
  await fs.copyFile(sourceAudio, audioPath);
  await fs.copyFile(sourceCover, coverPath);

  const target = await findTarget();
  const client = new Client(target.webSocketDebuggerUrl);
  await client.open();
  const assertions = {};
  const measurements = {};
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitFor(client, "Boolean(window.__avsRuntimeTest)", "API runtime M4");
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
      "projectM reale"
    );
    assertions.uiTerminology = await client.evaluate(`(() => {
      const text = document.body.innerText;
      return text.includes('Preset di progetto') &&
        text.includes('Preset MilkDrop') &&
        text.includes('Asset del progetto');
    })()`);
    check(assertions.uiTerminology, "Terminologia M4 incompleta.");

    await client.evaluate(
      `window.__avsRuntimeTest.loadAudio(${JSON.stringify(audioPath)})`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.configureDemo(${JSON.stringify(
        coverPath
      )}, 'Artista Ω', 'Titolo M4 日本語', 30)`
    );
    await client.evaluate(
      `window.avs.presetImport({
        kind: 'files',
        mode: 'copy',
        auditPaths: ${JSON.stringify(milkdropFixtures)}
      })`
    );
    const presetIds = await client.evaluate(
      `window.avs.presetList().then((items) => items
        .filter((item) => item.status !== 'missing' && !item.quarantined)
        .slice(0, 3).map((item) => item.id))`
    );
    check(presetIds.length >= 3, "Servono almeno tre Preset MilkDrop.");
    await client.evaluate(
      `window.__avsRuntimeTest.setPlaylist(${JSON.stringify(
        presetIds
      )}, ${JSON.stringify(presetIds[0])})`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.selectPreset(${JSON.stringify(presetIds[0])}, true)`
    );
    await client.evaluate("window.__avsRuntimeTest.setRestoreAuditState(" +
      JSON.stringify(presetIds[0]) + ")");
    await client.evaluate(`(() => {
      document.querySelector('[data-layer-id="cover"]').click();
      const assign = (selector, value) => {
        const input = document.querySelector(selector);
        input.value = String(value);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      assign('#transform-x', 0.43);
      assign('#transform-y', 0.34);
      assign('#transform-scale-x', 1.15);
      assign('#transform-scale-y', 0.82);
      assign('#transform-rotation', 37);
      document.querySelector('#keyframe-property').value = 'opacity';
      document.querySelector('#keyframe-property')
        .dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#keyframe-toggle').click();
      assign('#keyframe-value', 0.72);
      document.querySelector('#keyframe-interpolation').value = 'ease-in-out';
      document.querySelector('#keyframe-interpolation')
        .dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
    );
    const beforePreset = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    check(beforePreset.project.assets.length >= 2, "Manifest asset non creato.");
    check(
      beforePreset.project.assets.every(
        (item) => item.fileName && item.hash && item.status === "available"
      ),
      "Manifest asset incompleto."
    );

    const created = await client.evaluate(
      `window.__avsRuntimeTest.createProjectPreset(
        'Golden M4 Ω',
        { audio: true, cover: true, milkdropPreset: true, textures: true }
      )`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.exportProjectPresetAt(${JSON.stringify(
        created.id
      )}, ${JSON.stringify(exportedPresetPath)})`
    );
    const projectBeforePreview = await client.evaluate(
      "JSON.stringify(window.__avsRuntimeTest.snapshot().project)"
    );
    const preview = await client.evaluate(
      `window.__avsRuntimeTest.previewProjectPreset(${JSON.stringify(created.id)})`
    );
    const projectAfterPreview = await client.evaluate(
      "JSON.stringify(window.__avsRuntimeTest.snapshot().project)"
    );
    assertions.previewNonMutating = projectBeforePreview === projectAfterPreview;
    check(assertions.previewNonMutating, "Anteprima ha mutato il progetto.");
    check(preview.preset.assets.length >= 2, "Asset assenti dal .avspreset.");

    await client.evaluate(
      `window.__avsRuntimeTest.applyProjectPreset(${JSON.stringify(created.id)})`
    );
    const afterApply = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    assertions.applyOneCommand =
      afterApply.history.history.undoCount ===
      beforePreset.history.history.undoCount + 1;
    check(assertions.applyOneCommand, "Applicazione non è un singolo comando.");
    check(await client.evaluate("window.__avsRuntimeTest.undo()"), "Undo fallito.");
    check(await client.evaluate("window.__avsRuntimeTest.redo()"), "Redo fallito.");

    await client.evaluate(
      `window.avs.projectPresetDelete(${JSON.stringify(created.id)})`
    );
    const imported = await client.evaluate(
      `window.__avsRuntimeTest.importProjectPresetAt(${JSON.stringify(
        exportedPresetPath
      )})`
    );
    assertions.importExport = imported.id === created.id;
    check(assertions.importExport, "Import/export .avspreset non stabile.");
    await client.evaluate(
      `window.__avsRuntimeTest.applyProjectPreset(${JSON.stringify(imported.id)})`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
    );

    await fs.rename(audioPath, movedAudioPath);
    await fs.rename(coverPath, originalCoverBackup);
    await fs.copyFile(originalCoverBackup, mismatchCoverPath);
    await fs.appendFile(mismatchCoverPath, Buffer.from([0]));
    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
    );
    const missing = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    assertions.resilientOpen =
      missing.project.assets.filter((item) => item.status === "missing").length >= 2;
    check(assertions.resilientOpen, "Apertura resiliente non segnala i mancanti.");
    const audioAsset = missing.project.assets.find(
      (item) => item.type === "audio"
    );
    const coverAsset = missing.project.assets.find(
      (item) => item.type === "cover"
    );
    check(audioAsset && coverAsset, "Asset audio/cover non trovati.");
    await client.evaluate(
      `window.__avsRuntimeTest.relinkAssetAt(${JSON.stringify(
        audioAsset.id
      )}, ${JSON.stringify(movedAudioPath)}, false)`
    );
    const mismatchRejected = await client.evaluate(
      `window.__avsRuntimeTest.relinkAssetAt(${JSON.stringify(
        coverAsset.id
      )}, ${JSON.stringify(mismatchCoverPath)}, false)
        .then(() => false).catch(() => true)`
    );
    assertions.hashMismatchRequiresConfirmation = mismatchRejected;
    check(mismatchRejected, "Hash mismatch accettato senza conferma.");
    await client.evaluate(
      `window.__avsRuntimeTest.relinkAssetAt(${JSON.stringify(
        coverAsset.id
      )}, ${JSON.stringify(mismatchCoverPath)}, true)`
    );
    const relinked = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    assertions.relinkAtomic =
      relinked.project.audioFile === movedAudioPath &&
      relinked.project.cover.filePath === mismatchCoverPath &&
      relinked.project.assets
        .filter((item) => item.type === "audio" || item.type === "cover")
        .every((item) => item.status === "relinked");
    check(assertions.relinkAtomic, "Ricollegamento non applicato.");
    const sequenceBeforeSave = JSON.stringify(relinked.presetSequence);
    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
    );
    const reopened = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    assertions.saveReopen =
      !reopened.isDirty &&
      reopened.project.audioFile === movedAudioPath &&
      reopened.project.cover.filePath === mismatchCoverPath;
    assertions.seedSequenceStable =
      JSON.stringify(reopened.presetSequence) === sequenceBeforeSave;
    check(assertions.saveReopen, "Salvataggio/riapertura M4 non stabile.");
    check(assertions.seedSequenceStable, "Sequenza seed cambiata.");

    await client.evaluate("window.__avsRuntimeTest.setExportProfile(180, 320, 30)");
    const exportStarted = performance.now();
    const exportResult = await client.evaluate(
      `window.__avsRuntimeTest.exportAt(${JSON.stringify(videoPath)})`
    );
    measurements.exportSeconds = (performance.now() - exportStarted) / 1000;
    assertions.exportCompleted =
      exportResult.done === true && exportResult.cancelled !== true;
    check(assertions.exportCompleted, "Export M4 non completato.");

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    const report = {
      generatedAt: new Date().toISOString(),
      assertions,
      measurements,
      projectMVersion: reopened.projectMStatus?.version,
      presetCount: presetIds.length,
      projectPreset: {
        id: imported.id,
        path: exportedPresetPath,
        previewAssetCount: preview.preset.assets.length
      },
      assets: reopened.project.assets,
      history: reopened.history,
      paths: {
        projectPath,
        screenshotPath,
        videoPath,
        movedAudioPath,
        mismatchCoverPath
      }
    };
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    try {
      await client.evaluate("window.avs.projectMShutdown()");
      await client.evaluate("window.close()");
    } catch {}
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
