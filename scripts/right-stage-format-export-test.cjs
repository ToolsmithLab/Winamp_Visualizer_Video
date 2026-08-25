"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.argv[2] || 9480);
const audioPath = path.resolve(process.argv[3]);
const coverPath = path.resolve(process.argv[4]);
const outputDirectory = path.resolve(process.argv[5]);
const reportPath = path.resolve(process.argv[6]);
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

class Client {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
    this.events = [];
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) {
        if (message.method) this.events.push(message);
        return;
      }
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
      const page = targets.find(
        (candidate) =>
          candidate.type === "page" && candidate.url.includes("runtimeTest=1")
      );
      if (page) return page;
    } catch {}
    await delay(200);
  }
  throw new Error("Renderer Electron non trovato.");
}

async function waitFor(client, expression, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
}

async function main() {
  await fs.mkdir(outputDirectory, { recursive: true });
  const target = await findTarget();
  const client = new Client(target.webSocketDebuggerUrl);
  await client.open();
  const startedAt = Date.now();
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitFor(
      client,
      "Boolean(window.avs && window.__avsRuntimeTest)",
      "API runtime"
    );
    const cases = [
      ["9:16", 180, 320, "9x16"],
      ["1:1", 240, 240, "1x1"],
      ["4:3", 320, 240, "4x3"],
      ["16:9", 320, 180, "16x9"]
    ];
    const results = [];
    for (const [format, width, height, slug] of cases) {
      await client.evaluate(
        `(async () => {
          await window.__avsRuntimeTest.loadAudio(${JSON.stringify(audioPath)});
          await window.__avsRuntimeTest.loadCover(${JSON.stringify(coverPath)});
          for (const [selector, value] of [
            ["#simple-title", "Titolo formato"],
            ["#simple-artist", "Artista formato"]
          ]) {
            const input = document.querySelector(selector);
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
          await window.__avsRuntimeTest.selectSimpleEffect("spectrumBars");
        })()`
      );
      await client.evaluate(
        `window.__avsRuntimeTest.setProjectFormat(${JSON.stringify(format)});` +
          `window.__avsRuntimeTest.setExportProfile(${width},${height},30);` +
          "window.__avsRuntimeTest.setStageGuidesForTest(false);" +
          "window.__avsRuntimeTest.selectLayerForTest('cover');" +
          "window.__avsRuntimeTest.selectLayerForTest('')"
      );
      await delay(600);
      const stage = await client.evaluate(
        "window.__avsRuntimeTest.projectStageState()"
      );
      if (
        stage.format !== format ||
        stage.export.width !== width ||
        stage.export.height !== height
      ) {
        throw new Error(`Profilo incoerente per ${format}.`);
      }
      const previewPath = path.join(
        outputDirectory,
        `preview-ui-${slug}.png`
      );
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false
      });
      await fs.writeFile(previewPath, Buffer.from(screenshot.data, "base64"));
      const outputPath = path.join(outputDirectory, `export-${slug}.mp4`);
      const exportStartedAt = Date.now();
      const result = await client.evaluate(
        `window.__avsRuntimeTest.exportAt(${JSON.stringify(outputPath)})`
      );
      if (!result?.done || result?.error || result?.cancelled) {
        throw new Error(`Export fallito per ${format}.`);
      }
      results.push({
        format,
        width,
        height,
        previewPath,
        outputPath,
        elapsedSeconds: (Date.now() - exportStartedAt) / 1000,
        percent: result.percent
      });
    }
    const report = {
      generatedAt: new Date().toISOString(),
      passed: true,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
      results
    };
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    try {
      await client.evaluate("window.close()");
    } catch {}
    client.close();
  }
}

main().catch(async (error) => {
  await fs.writeFile(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        passed: false,
        error: String(error?.stack || error)
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
});
