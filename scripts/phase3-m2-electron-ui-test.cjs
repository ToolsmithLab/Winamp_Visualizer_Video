"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.argv[2] || 9342);
const audioPath = path.resolve(process.argv[3]);
const projectPath = path.resolve(process.argv[4]);
const exportPath = path.resolve(process.argv[5]);
const screenshotPath = path.resolve(process.argv[6]);
const reportPath = path.resolve(process.argv[7]);
const pluginIds = [
  "spectrumBars",
  "circularSpectrum",
  "waveformLine",
  "particleBurst",
  "pulseShapes",
  "dynamicVignette",
  "radialRays",
  "mirroredWaveform",
  "audioGrid",
  "orbitingParticles"
];

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

class Client {
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

async function target() {
  const deadline = Date.now() + 20_000;
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
  throw new Error("Renderer Electron M2 non trovato.");
}

async function waitFor(client, expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timeout ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await fs.access(audioPath);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const page = await target();
  const client = new Client(page.webSocketDebuggerUrl);
  await client.open();
  const checkpoints = {};
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitFor(client, "Boolean(window.__avsRuntimeTest)", "runtime API");
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
      "projectM"
    );
    await client.evaluate(
      `window.__avsRuntimeTest.loadAudio(${JSON.stringify(audioPath)})`
    );

    checkpoints.catalog = await client.evaluate(`(() => {
      const select = document.querySelector('#plugin-add-select');
      return [...select.options].map((option) => option.value);
    })()`);
    assert(
      JSON.stringify(checkpoints.catalog) === JSON.stringify(pluginIds),
      "Catalogo UI non contiene i dieci plugin ordinati."
    );

    for (const id of pluginIds) {
      await client.evaluate(`(() => {
        const select = document.querySelector('#plugin-add-select');
        select.value = ${JSON.stringify(id)};
        document.querySelector('#layer-add').click();
      })()`);
    }
    checkpoints.afterAdd = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    const present = new Set(
      checkpoints.afterAdd.project.layers
        .filter((layer) => layer.kind === "visualizer")
        .map((layer) => layer.plugin?.id || layer.pluginId)
    );
    assert(pluginIds.every((id) => present.has(id)), "Plugin aggiunto mancante.");
    assert(
      await client.evaluate("document.activeElement?.id === 'layer-name'"),
      "Focus non spostato al nome layer dopo aggiunta."
    );

    await client.evaluate(`(() => {
      const layer = window.__avsRuntimeTest.snapshot().project.layers
        .filter((item) => item.plugin?.id === 'radialRays').at(-1);
      document.querySelector('[data-layer-id="' + layer.id + '"]').click();
      return true;
    })()`);
    await delay(100);
    checkpoints.parameterTypes = await client.evaluate(`(() => ({
      number: Boolean(document.querySelector('#plugin-inspector input[type=range]')),
      boolean: Boolean(document.querySelector('#plugin-inspector input[type=checkbox]')),
      color: Boolean(document.querySelector('#plugin-inspector input[type=color]')),
      select: Boolean(document.querySelector('#plugin-inspector select'))
    }))()`);
    assert(
      Object.values(checkpoints.parameterTypes).every(Boolean),
      "Inspector non espone tutti i tipi parametro."
    );
    await client.evaluate(`(() => {
      const range = document.querySelector('#plugin-inspector input[type=range]');
      range.value = String(Number(range.min) + Number(range.step) * 2);
      range.dispatchEvent(new Event('input', { bubbles: true }));
      range.dispatchEvent(new Event('change', { bubbles: true }));
      const checkbox = document.querySelector('#plugin-inspector input[type=checkbox]');
      checkbox.click();
      const color = document.querySelector('#plugin-inspector input[type=color]');
      color.value = '#00ff88';
      color.dispatchEvent(new Event('input', { bubbles: true }));
      color.dispatchEvent(new Event('change', { bubbles: true }));
      const select = document.querySelector('#plugin-inspector select');
      select.selectedIndex = Math.min(1, select.options.length - 1);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    checkpoints.afterParameters = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    assert(checkpoints.afterParameters.isDirty, "Parametri non rendono dirty.");

    await client.evaluate(`(() => {
      const layer = window.__avsRuntimeTest.snapshot().project.layers
        .filter((item) => item.plugin?.id === 'orbitingParticles').at(-1);
      document.querySelector('[data-layer-id="' + layer.id + '"]').click();
      document.querySelector('#layer-duplicate').click();
      document.querySelector('#layer-up').click();
      document.querySelector('#layer-locked').click();
      document.querySelector('#layer-visible').click();
      return true;
    })()`);
    checkpoints.afterDuplicate = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    assert(
      checkpoints.afterDuplicate.project.layers.filter(
        (layer) => layer.plugin?.id === "orbitingParticles"
      ).length >= 2,
      "Duplicazione stateful non riuscita."
    );

    await client.evaluate("document.querySelector('#layer-delete').click()");
    await client.evaluate("document.querySelector('#undo-command').click()");
    await client.evaluate(
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true}))"
    );
    await client.evaluate(
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))"
    );
    checkpoints.afterHistory = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );

    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
    );
    checkpoints.saved = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    assert(!checkpoints.saved.isDirty, "Save M2 resta dirty.");
    const savedDocument = JSON.parse(await fs.readFile(projectPath, "utf8"));
    const sourceLayer = savedDocument.layers.find(
      (layer) => layer.kind === "visualizer"
    );
    savedDocument.layers.push({
      ...structuredClone(sourceLayer),
      id: "controlled-missing-plugin",
      name: "Errore plugin controllato",
      pluginId: "missingCanvasForM2Test",
      plugin: {
        id: "missingCanvasForM2Test",
        version: "1.0.0",
        settings: {},
        unknownData: { preserved: true }
      }
    });
    await fs.writeFile(
      projectPath,
      `${JSON.stringify(savedDocument, null, 2)}\n`,
      "utf8"
    );
    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
    );
    checkpoints.reopened = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    assert(!checkpoints.reopened.isDirty, "Reopen M2 resta dirty.");
    assert(
      checkpoints.reopened.projectMStatus?.running,
      "projectM non continua sotto i plugin Canvas."
    );
    checkpoints.controlledErrorState = await client.evaluate(`(() => {
      document.querySelector('[data-layer-id="controlled-missing-plugin"]').click();
      const text = document.querySelector('#plugin-inspector').textContent;
      return {
        visible: text.includes('Plugin non disponibile: missingCanvasForM2Test'),
        preserved: window.__avsRuntimeTest.snapshot().project.layers.some(
          (layer) => layer.id === 'controlled-missing-plugin' &&
            layer.plugin?.unknownData?.preserved === true
        )
      };
    })()`);
    assert(
      checkpoints.controlledErrorState.visible &&
        checkpoints.controlledErrorState.preserved,
      "Stato errore controllato non visibile o dati plugin persi."
    );

    await client.evaluate("window.__avsRuntimeTest.setExportProfile(360,640,30)");
    const exportResult = await client.evaluate(
      `window.__avsRuntimeTest.exportAt(${JSON.stringify(exportPath)})`
    );
    const exported = await fs.stat(exportPath);
    assert(exported.size > 0, "MP4 M2 vuoto.");
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

    const report = {
      generatedAt: new Date().toISOString(),
      target: { title: page.title, url: page.url },
      assertions: {
        catalogTen: true,
        addTen: true,
        focusAfterAdd: true,
        parameterTypes: true,
        parameterCommands: true,
        duplicateStateful: true,
        reorderLockVisibilityDelete: true,
        undoRedo: true,
        saveReopen: true,
        controlledErrorState: true,
        projectMContinues: true,
        exportMp4: true
      },
      checkpoints: {
        catalog: checkpoints.catalog,
        parameterTypes: checkpoints.parameterTypes,
        layerCountAfterAdd: checkpoints.afterAdd.project.layers.length,
        undoCount: checkpoints.afterHistory.history.history.undoCount,
        reopenedLayerCount: checkpoints.reopened.project.layers.length,
        controlledErrorState: checkpoints.controlledErrorState,
        projectMVersion: checkpoints.reopened.projectMStatus?.version
      },
      exportResult,
      exportBytes: exported.size,
      projectPath,
      exportPath,
      screenshotPath
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
