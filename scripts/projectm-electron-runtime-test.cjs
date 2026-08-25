"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.argv[2] || 9223);
const audioPath = path.resolve(
  process.argv[3] || "test-results/phase2/multiband.wav"
);
const screenshotPath = path.resolve(
  process.argv[4] || "test-results/phase2/projectm-electron-preview.png"
);
const reportPath = path.resolve(
  process.argv[5] || "test-results/phase2/projectm-electron-runtime.json"
);
const holdMs = Number(process.argv[6] || 0);

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.consoleMessages = [];
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
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
        return;
      }
      if (message.method === "Runtime.consoleAPICalled") {
        const text = (message.params.args || [])
          .map((argument) => argument.value ?? argument.description ?? "")
          .join(" ");
        this.consoleMessages.push(text);
      }
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
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text ||
          "Errore JavaScript nel renderer Electron"
      );
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
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
          candidate.type === "page" &&
          candidate.url.includes("runtimeTest=1")
      );
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw lastError || new Error("Renderer Electron non trovato.");
}

async function waitFor(client, predicate, label, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await client.evaluate(predicate);
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}. Ultimo valore: ${JSON.stringify(value)}`);
}

async function snapshot(client) {
  return client.evaluate("window.__avsRuntimeTest?.snapshot()");
}

async function main() {
  const target = await findTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitFor(
      client,
      "Boolean(window.__avsRuntimeTest)",
      "API runtime test"
    );
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
      "projectM disponibile"
    );
    await waitFor(
      client,
      "Boolean(window.__avsRuntimeTest.snapshot().projectMFrame)",
      "primo framebuffer projectM"
    );
    const initial = await snapshot(client);

    await client.evaluate(
      `window.__avsRuntimeTest.loadAudio(${JSON.stringify(audioPath)})`
    );
    const loaded = await snapshot(client);
    if (!(loaded.duration > 0)) {
      throw new Error("Il nuovo audio non è stato decodificato.");
    }

    await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
    await delay(350);
    const playing = await snapshot(client);
    if (!playing.playing || playing.currentTime <= 0) {
      throw new Error("Play non ha fatto avanzare l'audio.");
    }

    await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
    const pausedAt = (await snapshot(client)).currentTime;
    await delay(250);
    const paused = await snapshot(client);
    if (paused.playing || Math.abs(paused.currentTime - pausedAt) > 0.08) {
      throw new Error("Pausa non stabile.");
    }

    await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
    await delay(350);
    const resumed = await snapshot(client);
    if (!resumed.playing || resumed.currentTime <= paused.currentTime + 0.15) {
      throw new Error("Ripresa non ha fatto avanzare l'audio.");
    }

    await client.evaluate("window.__avsRuntimeTest.seek(0.2)");
    await delay(500);
    const sought = await snapshot(client);
    if (sought.currentTime < 0.15 || sought.currentTime > 1.2) {
      throw new Error(`Seek inatteso: ${sought.currentTime}`);
    }

    await client.evaluate("window.__avsRuntimeTest.stopPlayback()");
    await client.evaluate(
      `window.__avsRuntimeTest.loadAudio(${JSON.stringify(audioPath)})`
    );
    const reloaded = await snapshot(client);
    if (reloaded.currentTime > 0.1 || reloaded.duration <= 0) {
      throw new Error("Nuovo caricamento audio non ha resettato il clock.");
    }

    await client.evaluate("window.__avsRuntimeTest.setProjectMEnabled(false)");
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disattivato'",
      "disattivazione projectM"
    );
    await delay(300);
    const disabled = await snapshot(client);
    if (disabled.projectMStatus?.running) {
      throw new Error("Il processo projectM è ancora attivo dopo la disattivazione.");
    }

    await client.evaluate("window.__avsRuntimeTest.setProjectMEnabled(true)");
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
      "riattivazione projectM"
    );
    await waitFor(
      client,
      "Boolean(window.__avsRuntimeTest.snapshot().projectMFrame)",
      "frame dopo riattivazione"
    );
    const reenabled = await snapshot(client);
    let held = null;
    if (holdMs > 0) {
      await client.evaluate(
        `window.__avsRuntimeTest.loadAudio(${JSON.stringify(audioPath)})`
      );
      await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
      await delay(holdMs);
      held = await snapshot(client);
    }

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

    const report = {
      target: { title: target.title, url: target.url },
      runtime: {
        hostPath: reenabled.projectMStatus.hostPath,
        libraryPath: reenabled.projectMStatus.libraryPath,
        presetPath: reenabled.projectMStatus.presetPath,
        version: reenabled.projectMStatus.version,
        glRenderer: reenabled.projectMStatus.glRenderer,
        glVersion: reenabled.projectMStatus.glVersion
      },
      initial,
      loaded,
      playing,
      paused,
      resumed,
      sought,
      reloaded,
      disabled,
      reenabled,
      held,
      metrics: client.consoleMessages.filter((message) =>
        message.includes("[AVS_METRICS]")
      ),
      screenshotPath,
      reportPath
    };
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    try {
      await client.evaluate("window.avs.projectMShutdown()");
    } catch {
      // Electron may already be shutting down.
    }
    try {
      await client.evaluate("window.close()");
    } catch {
      // The BrowserWindow may already have been closed by the application.
    }
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
