"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.argv[2] || 9346);
const reportPath = path.resolve(process.argv[3]);
const screenshotPath = path.resolve(process.argv[4]);
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

async function target() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find(
        (item) => item.type === "page" && item.url.includes("runtimeTest=1")
      );
      if (page) return page;
    } catch {}
    await delay(200);
  }
  throw new Error("Finestra pacchetto M4 non trovata.");
}

async function waitFor(client, expression, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timeout ${label}.`);
}

async function main() {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const page = await target();
  const client = new Client(page.webSocketDebuggerUrl);
  await client.open();
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitFor(client, "Boolean(window.__avsRuntimeTest)", "API runtime");
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
      "projectM"
    );
    const result = await client.evaluate(`(() => {
      const snapshot = window.__avsRuntimeTest.snapshot();
      const text = document.body.innerText;
      return {
        projectMVersion: snapshot.projectMStatus?.version,
        projectMHostPath: snapshot.projectMStatus?.hostPath,
        projectMLibraryPath: snapshot.projectMStatus?.libraryPath,
        uiTerminology:
          text.includes('Preset di progetto') &&
          text.includes('Preset MilkDrop') &&
          text.includes('Asset del progetto'),
        projectPresetControls: [
          '[data-action="create"]',
          '[data-action="import"]',
          '[data-role="search"]',
          '[data-role="sort"]'
        ].every((selector) => document.querySelector(selector)),
        assetControls: [
          '[data-asset-action="search"]',
          '[data-asset-action="search-recursive"]',
          '[data-role="asset-list"]'
        ].every((selector) => document.querySelector(selector))
      };
    })()`);
    if (
      result.projectMVersion !== "4.1.6" ||
      !result.uiTerminology ||
      !result.projectPresetControls ||
      !result.assetControls
    ) {
      throw new Error(`Smoke package M4 fallito: ${JSON.stringify(result)}`);
    }
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    const report = {
      generatedAt: new Date().toISOString(),
      passed: true,
      ...result,
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

