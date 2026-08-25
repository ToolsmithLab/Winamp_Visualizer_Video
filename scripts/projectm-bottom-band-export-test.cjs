"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const port = Number(process.argv[2] || 9490);
const audioPath = path.resolve(process.argv[3]);
const coverPath = path.resolve(process.argv[4]);
const secondPresetPath = path.resolve(process.argv[5]);
const ffmpegPath = path.resolve(process.argv[6]);
const frameDecoderPath = process.env.AVS_FRAME_FFMPEG
  ? path.resolve(process.env.AVS_FRAME_FFMPEG)
  : ffmpegPath;
const outputDirectory = path.resolve(process.argv[7]);
const reportPath = path.resolve(process.argv[8]);
const fullSizeOnly = process.argv[9] === "full";
const projectPath = path.join(outputDirectory, "band-save-reopen.avsproj");
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
      const page = targets.find(
        (target) =>
          target.type === "page" && target.url.includes("runtimeTest=1")
      );
      if (page) return page;
    } catch {}
    await delay(200);
  }
  throw new Error("Renderer Electron runtime non trovato.");
}

async function waitFor(client, expression, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
}

function frameCoverage(videoPath, width, height) {
  const decoded = spawnSync(
    frameDecoderPath,
    [
      "-v",
      "error",
      "-ss",
      "2",
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1"
    ],
    { maxBuffer: width * height * 4 + 1024 * 1024 }
  );
  if (decoded.status !== 0) {
    throw new Error(decoded.stderr.toString("utf8") || "Decodifica MP4 fallita.");
  }
  const stride = width * 4;
  const expectedBytes = stride * height;
  if (decoded.stdout.byteLength !== expectedBytes) {
    throw new Error(
      `Frame export ${decoded.stdout.byteLength} byte; attesi ${expectedBytes}.`
    );
  }
  const rows = [];
  for (let row = 0; row < height; row += 1) {
    const start = row * stride;
    let luminance = 0;
    let squared = 0;
    let alphaValid = true;
    for (let x = 0; x < width; x += 1) {
      const offset = start + x * 4;
      const value =
        decoded.stdout[offset] * 0.2126 +
        decoded.stdout[offset + 1] * 0.7152 +
        decoded.stdout[offset + 2] * 0.0722;
      luminance += value;
      squared += value * value;
      if (decoded.stdout[offset + 3] !== 255) alphaValid = false;
    }
    const average = luminance / width;
    rows.push({
      row,
      averageLuminance: average,
      deviation: Math.sqrt(Math.max(0, squared / width - average ** 2)),
      alphaValid
    });
  }
  const lastTen = rows.slice(-10);
  const blankLastTen = lastTen.every(
    (row) => row.averageLuminance < 0.5 && row.deviation < 0.5
  );
  if (blankLastTen) {
    throw new Error("Rilevata fascia nera uniforme nelle ultime 10 righe.");
  }
  if (!rows.every((row) => row.alphaValid)) {
    throw new Error("Alpha finale non valido nel frame esportato.");
  }
  return {
    width,
    height,
    stride,
    byteLength: decoded.stdout.byteLength,
    alphaValid: true,
    firstRow: rows[0],
    lastRow: rows.at(-1),
    lastTenRows: lastTen,
    blankLastTen
  };
}

async function configure(
  client,
  format,
  width,
  height,
  effect,
  cover
) {
  await client.evaluate(
    `window.__avsRuntimeTest.configureExportAudit(${JSON.stringify({
      audioPath,
      coverPath: cover ? coverPath : null,
      title: "Titolo banda",
      artist: "Artista banda",
      effect
    })})`
  );
  await client.evaluate(
    `window.__avsRuntimeTest.setProjectFormat(${JSON.stringify(format)});` +
      `window.__avsRuntimeTest.setExportProfile(${width},${height},30);` +
      "window.__avsRuntimeTest.setStageGuidesForTest(false)"
  );
  if (effect === "projectM") {
    await waitFor(
      client,
      "Boolean(window.__avsRuntimeTest.snapshot().projectMFrame)",
      `frame projectM ${format}`
    );
  }
  await delay(250);
}

async function main() {
  await fs.mkdir(outputDirectory, { recursive: true });
  const target = await findTarget();
  const client = new Client(target.webSocketDebuggerUrl);
  await client.open();
  const startedAt = Date.now();
  const results = [];
  try {
    await client.send("Runtime.enable");
    await waitFor(
      client,
      "Boolean(window.avs && window.__avsRuntimeTest)",
      "API runtime"
    );

    const imported = await client.evaluate(
      `window.__avsRuntimeTest.importSimplePresetsAt("files","copy",[${JSON.stringify(
        secondPresetPath
      )}])`
    );
    if (!imported || imported.imported.length < 1) {
      throw new Error("Secondo preset reale non importato.");
    }
    const library = await client.evaluate(
      "window.__avsRuntimeTest.simplePresetLibraryState()"
    );
    const secondPreset = library.records.find(
      (record) => path.basename(record.path) === path.basename(secondPresetPath)
    );
    if (!secondPreset) throw new Error("Secondo preset non indicizzato.");

    const cases = fullSizeOnly
      ? [
          {
            id: "9x16-720x1280-cover-projectm",
            format: "9:16",
            width: 720,
            height: 1280,
            effect: "projectM",
            cover: true
          }
        ]
      : [
      {
        id: "9x16-projectm",
        format: "9:16",
        width: 180,
        height: 320,
        effect: "projectM",
        cover: false
      },
      {
        id: "9x16-cover",
        format: "9:16",
        width: 180,
        height: 320,
        effect: "none",
        cover: true
      },
      {
        id: "9x16-cover-projectm",
        format: "9:16",
        width: 180,
        height: 320,
        effect: "projectM",
        cover: true
      },
      {
        id: "1x1",
        format: "1:1",
        width: 240,
        height: 240,
        effect: "projectM",
        cover: true
      },
      {
        id: "4x3",
        format: "4:3",
        width: 320,
        height: 240,
        effect: "projectM",
        cover: true
      },
      {
        id: "16x9",
        format: "16:9",
        width: 320,
        height: 180,
        effect: "projectM",
        cover: true
      },
      {
        id: "9x16-resized-effect",
        format: "9:16",
        width: 180,
        height: 320,
        effect: "projectM",
        cover: false,
        resized: true
      },
      {
        id: "9x16-preset-change",
        format: "9:16",
        width: 180,
        height: 320,
        effect: "projectM",
        cover: true,
        presetId: secondPreset.id
      }
        ];

    for (const item of cases) {
      await configure(
        client,
        item.format,
        item.width,
        item.height,
        item.effect,
        item.cover
      );
      if (item.resized) {
        await client.evaluate(
          "window.__avsRuntimeTest.setEffectTransformForTest(" +
            "{x:0.46,y:0.43,scaleX:0.74,scaleY:0.68,rotation:5})"
        );
      }
      if (item.presetId) {
        const selected = await client.evaluate(
          `window.__avsRuntimeTest.selectPreset(${JSON.stringify(
            item.presetId
          )},true)`
        );
        if (!selected) throw new Error("Cambio preset non riuscito.");
      }

      const previewData = await client.evaluate(
        "document.querySelector('#preview').toDataURL('image/png')"
      );
      const previewPath = path.join(
        outputDirectory,
        `preview-${item.id}.png`
      );
      await fs.writeFile(
        previewPath,
        Buffer.from(previewData.split(",", 2)[1], "base64")
      );

      const outputPath = path.join(outputDirectory, `export-${item.id}.mp4`);
      const exportStarted = Date.now();
      const result = await client.evaluate(
        `window.__avsRuntimeTest.exportAt(${JSON.stringify(outputPath)})`
      );
      if (!result?.done || result?.error || result?.cancelled) {
        throw new Error(`Export fallito: ${item.id}.`);
      }
      const coverage = frameCoverage(outputPath, item.width, item.height);
      results.push({
        ...item,
        outputPath,
        previewPath,
        elapsedSeconds: (Date.now() - exportStarted) / 1000,
        percent: result.percent,
        coverage
      });
    }

    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
    );
    const beforeOpen = await client.evaluate(
      "JSON.stringify(window.__avsRuntimeTest.snapshot().project)"
    );
    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
    );
    const afterOpen = await client.evaluate(
      "JSON.stringify(window.__avsRuntimeTest.snapshot().project)"
    );
    const saved = JSON.parse(beforeOpen);
    const reopened = JSON.parse(afterOpen);
    const saveReopen =
      saved.exportSettings.width === reopened.exportSettings.width &&
      saved.exportSettings.height === reopened.exportSettings.height &&
      saved.projectM.presetId === reopened.projectM.presetId &&
      JSON.stringify(
        saved.layers.find((layer) => layer.kind === "projectM")?.transform
      ) ===
        JSON.stringify(
          reopened.layers.find((layer) => layer.kind === "projectM")?.transform
        );
    if (!saveReopen) throw new Error("Save/reopen ha cambiato il layout.");

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1000,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false
    });
    await delay(300);
    const resizedStage = await client.evaluate(
      "window.__avsRuntimeTest.projectStageState()"
    );
    const ratio = resizedStage.stage.width / resizedStage.stage.height;
    if (Math.abs(ratio - 9 / 16) > 0.01) {
      throw new Error("Resize finestra ha cambiato il rapporto stage.");
    }

    await fs.writeFile(
      reportPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          passed: true,
          elapsedSeconds: (Date.now() - startedAt) / 1000,
          saveReopen,
          resizedStage,
          importedPreset: secondPreset,
          results
        },
        null,
        2
      )}\n`
    );
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
