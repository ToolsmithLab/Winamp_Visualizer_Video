"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const root = path.resolve(__dirname, "..");
const directory = path.join(root, "test-results", "video-layer-real-case");
const projectPath = path.join(directory, "caso-reale.avsproject");
const videoPath = path.join(directory, "caso-reale-1080x1920.mp4");
const previewPath = path.join(directory, "preview-1s.png");
const exportPath = path.join(directory, "export-1s-540x960.png");
const reportPath = path.join(directory, "preview-export-compare.json");
const electronPath = path.join(
  root,
  "node_modules",
  "electron",
  "dist",
  "electron.exe"
);
const ffmpegPath = path.join(
  root,
  "native",
  "ffmpeg",
  "win-x64",
  "ffmpeg.exe"
);
const port = 9376;
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
      returnByValue: true,
      awaitPromise: true,
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

async function pageTarget() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const pages = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json();
      const page = pages.find(
        (item) => item.type === "page" && item.url.includes("runtimeTest=1")
      );
      if (page) return page;
    } catch {}
    await delay(150);
  }
  throw new Error("Renderer non trovato.");
}

async function main() {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const electron = spawn(
    electronPath,
    [
      "--noerrdialogs",
      "--disable-gpu",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${path.join(directory, "compare-user-data")}`,
      ".",
      "--avs-runtime-test"
    ],
    {
      cwd: root,
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    }
  );
  let client;
  try {
    const page = await pageTarget();
    client = new Client(page.webSocketDebuggerUrl);
    await client.open();
    await client.send("Runtime.enable");
    const apiDeadline = Date.now() + 30_000;
    while (
      Date.now() < apiDeadline &&
      !(await client.evaluate("Boolean(window.__avsRuntimeTest)"))
    ) {
      await delay(100);
    }
    assert.equal(
      await client.evaluate("Boolean(window.__avsRuntimeTest)"),
      true
    );
    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
    );
    await client.evaluate(
      "window.__avsRuntimeTest.setStageGuidesForTest(false)"
    );
    await client.evaluate("window.__avsRuntimeTest.selectLayerForTest('')");
    await client.evaluate("window.__avsRuntimeTest.seek(1)");
    await delay(1_000);
    const capture = await client.evaluate(`(() => {
      const canvas = document.querySelector('#preview');
      return {
        data: canvas.toDataURL('image/png').split(',')[1],
        width: canvas.width,
        height: canvas.height,
        video: window.__avsRuntimeTest.videoLayerState().preview
      };
    })()`);
    assert.ok(Math.abs(capture.video.currentTime - 1) < 0.2);
    await fsp.writeFile(previewPath, Buffer.from(capture.data, "base64"));

    const extraction = spawnSync(
      ffmpegPath,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "1",
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-vf",
        `scale=${capture.width}:${capture.height}:flags=lanczos`,
        exportPath
      ],
      { windowsHide: true, encoding: "utf8" }
    );
    if (extraction.status !== 0) throw new Error(extraction.stderr);

    const [previewImage, exportImage] = await Promise.all([
      loadImage(previewPath),
      loadImage(exportPath)
    ]);
    const canvas = createCanvas(capture.width, capture.height);
    const context = canvas.getContext("2d");
    context.drawImage(previewImage, 0, 0);
    const preview = context.getImageData(
      0,
      0,
      capture.width,
      capture.height
    ).data;
    context.clearRect(0, 0, capture.width, capture.height);
    context.drawImage(exportImage, 0, 0);
    const exported = context.getImageData(
      0,
      0,
      capture.width,
      capture.height
    ).data;
    let absolute = 0;
    let squared = 0;
    let compared = 0;
    for (let index = 0; index < preview.length; index += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        const difference = preview[index + channel] - exported[index + channel];
        absolute += Math.abs(difference);
        squared += difference * difference;
        compared += 1;
      }
    }
    const meanAbsoluteError = absolute / compared;
    const rootMeanSquareError = Math.sqrt(squared / compared);
    const report = {
      generatedAt: new Date().toISOString(),
      timestamp: 1,
      width: capture.width,
      height: capture.height,
      previewVideoTime: capture.video.currentTime,
      meanAbsoluteError,
      rootMeanSquareError,
      previewPath,
      exportPath
    };
    // H.264 is lossy and Chromium/FFmpeg may use slightly different color
    // conversion, but a layout/timestamp mismatch produces a much larger MAE.
    assert.ok(meanAbsoluteError < 28, JSON.stringify(report));
    await fsp.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    try {
      await client?.evaluate("window.close(); true");
    } catch {}
    client?.close();
    await delay(800);
    if (electron.exitCode === null) electron.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
