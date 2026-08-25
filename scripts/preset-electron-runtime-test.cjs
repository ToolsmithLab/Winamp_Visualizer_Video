"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.argv[2] || 9240);
const screenshotPath = path.resolve(
  process.argv[3] || "test-results/phase2/preset-library-runtime.png"
);
const reportPath = path.resolve(
  process.argv[4] || "test-results/phase2/preset-library-runtime.json"
);
const audioPath = path.resolve(
  process.argv[5] || "test-results/phase2/multiband-10s.wav"
);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function target() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json();
      const page = targets.find((candidate) => candidate.type === "page");
      if (page) return page;
    } catch {
      // Electron may still be starting.
    }
    await delay(200);
  }
  throw new Error("Target Electron non trovato.");
}

class Cdp {
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
      if (!message.id) return;
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
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  }
  close() {
    this.socket.close();
  }
}

async function waitFor(client, expression, label) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const value = await client.evaluate(expression);
      if (value) return value;
    } catch {
      // Context is temporarily unavailable during reload.
    }
    await delay(150);
  }
  throw new Error(`Timeout: ${label}`);
}

async function main() {
  const page = await target();
  const client = new Cdp(page.webSocketDebuggerUrl);
  await client.open();
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitFor(client, "Boolean(window.avs && window.__avsRuntimeTest)", "preload e renderer");
    const initial = await client.evaluate("window.avs.presetList({})");
    const imported = initial.find((preset) => preset.name === "valid");
    if (!imported) throw new Error("Preset E2E persistito non trovato.");
    const selected = await client.evaluate(
      `window.avs.presetSelect(${JSON.stringify(imported.id)})`
    );
    if (
      selected.status.version !== "4.1.6" ||
      selected.status.preset !== "valid.milk"
    ) {
      throw new Error("Il preset importato non è stato caricato da projectM reale.");
    }
    await client.evaluate(
      `window.avs.presetFavorite(${JSON.stringify(imported.id)}, true)`
    );
    const favoriteBeforeReload = await client.evaluate(
      `window.avs.presetList({favoritesOnly:true})`
    );
    await client.evaluate("location.reload()");
    await waitFor(client, "Boolean(window.avs && window.__avsRuntimeTest)", "reload renderer");
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
      "Motore projectM dopo reload"
    );
    const favoriteAfterReload = await client.evaluate(
      `window.avs.presetList({favoritesOnly:true})`
    );
    if (!favoriteAfterReload.some((preset) => preset.id === imported.id)) {
      throw new Error("Preferito non persistito dopo reload.");
    }
    await waitFor(
      client,
      `Boolean(document.querySelector('[data-preset-id="${imported.id}"] [data-preset-action="select"]'))`,
      "riga Libreria preset"
    );
    await client.evaluate(
      `document.querySelector('[data-preset-id="${imported.id}"] [data-preset-action="select"]').click()`
    );
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStatus?.preset === 'valid.milk'",
      "Anteprima preset da UI"
    );
    await client.evaluate(
      `document.querySelector('[data-preset-id="${imported.id}"] [data-preset-action="playlist"]').click()`
    );
    await waitFor(
      client,
      `window.__avsRuntimeTest.snapshot().projectMSettings.playlistIds.includes(${JSON.stringify(imported.id)})`,
      "preset aggiunto alla playlist"
    );
    await client.evaluate(
      `window.__avsRuntimeTest.setPresetAutomation(true, 2, 424242)`
    );
    const sequenceBeforePlayback = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().presetSequence.slice(0,6)"
    );
    await client.evaluate(
      `window.__avsRuntimeTest.loadAudio(${JSON.stringify(audioPath)})`
    );
    await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
    await delay(4300);
    await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
    await delay(250);
    const pausedFrame = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().projectMFrame?.frameIndex"
    );
    await delay(350);
    const pausedSnapshot = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    if (pausedSnapshot.projectMFrame?.frameIndex !== pausedFrame) {
      throw new Error("La transizione non si è fermata durante la pausa.");
    }
    if (
      pausedSnapshot.projectMSettings.history.filter(
        (entry) => entry.source === "automatic"
      ).length < 2
    ) {
      throw new Error("I cambi automatici non sono stati applicati.");
    }
    await client.evaluate("window.__avsRuntimeTest.seek(6.2)");
    await delay(700);
    const seekSnapshot = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    await client.evaluate("window.__avsRuntimeTest.presetCommand('random')");
    await client.evaluate("window.__avsRuntimeTest.presetCommand('restart')");
    const manualSnapshot = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    await client.evaluate(
      `window.scrollTo(0,0); (() => { const panel=document.querySelector('.panel-content'); const card=document.querySelector('.preset-control-card'); panel.scrollTop += card.getBoundingClientRect().top - panel.getBoundingClientRect().top - 20; })()`
    );
    await delay(300);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    const report = {
      generatedAt: new Date().toISOString(),
      imported,
      selected,
      initialCount: initial.length,
      favoriteBeforeReload,
      favoriteAfterReload,
      sequenceBeforePlayback,
      pausedSnapshot,
      seekSnapshot,
      manualSnapshot,
      screenshotPath
    };
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await client.evaluate(
      `window.avs.presetFavorite(${JSON.stringify(imported.id)}, false)`
    );
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
      // La finestra può essere già chiusa.
    }
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
