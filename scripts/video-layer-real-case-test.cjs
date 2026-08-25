"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
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
const resultDirectory = path.join(root, "test-results", "video-layer-real-case");
const clipPath = path.join(resultDirectory, "clip-1080x1920-8s.mp4");
const audioPath = path.join(resultDirectory, "audio-4m13s.wav");
const projectPath = path.join(resultDirectory, "caso-reale.avsproject");
const outputPath = path.join(resultDirectory, "caso-reale-1080x1920.mp4");
const reportPath = path.join(resultDirectory, "runtime-results.json");
const port = Number(process.argv[2] || 9361);

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
          response.exceptionDetails.text ||
          "Errore renderer"
      );
    }
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function target() {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find(
        (candidate) =>
          candidate.type === "page" && candidate.url.includes("runtimeTest=1")
      );
      if (page) return page;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw lastError || new Error("Renderer non trovato.");
}

async function waitFor(client, expression, label, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await client.evaluate(expression);
    if (value) return value;
    await delay(120);
  }
  throw new Error(`Timeout ${label}: ${JSON.stringify(value)}`);
}

function probeOutput(file) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-i", file], {
    encoding: "utf8",
    windowsHide: true
  });
  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  return {
    size: fs.statSync(file).size,
    duration:
      text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)?.[0] ?? "",
    dimensions: text.match(/Video:.*?(\d{2,5})x(\d{2,5})/)?.[0] ?? "",
    videoStreams: (text.match(/Stream #\d+:\d+.*Video:/g) || []).length,
    audioStreams: (text.match(/Stream #\d+:\d+.*Audio:/g) || []).length,
    codec: text.match(/Video:\s*([^,\r\n]+)/)?.[1] ?? "",
    audioCodec: text.match(/Audio:\s*([^,\r\n]+)/)?.[1] ?? ""
  };
}

function frameMd5(file, timestamp) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(timestamp),
      "-i",
      file,
      "-frames:v",
      "1",
      "-f",
      "md5",
      "pipe:1"
    ],
    { encoding: "utf8", windowsHide: true }
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

async function main() {
  for (const file of [clipPath, audioPath]) {
    if (!fs.existsSync(file)) throw new Error(`Fixture mancante: ${file}`);
  }
  await fsp.rm(outputPath, { force: true });
  await fsp.rm(projectPath, { force: true });
  await fsp.rm(reportPath, { force: true });
  await fsp.rm(path.join(resultDirectory, "runtime-failure.txt"), {
    force: true
  });
  const userData = path.join(resultDirectory, "electron-user-data");
  await fsp.rm(userData, { recursive: true, force: true });
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const electron = spawn(
    electronPath,
    [
      "--noerrdialogs",
      "--disable-gpu",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userData}`,
      ".",
      "--avs-runtime-test"
    ],
    {
      cwd: root,
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let stderr = "";
  electron.stderr.setEncoding("utf8");
  electron.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-128_000);
  });
  let client;
  const report = {
    startedAt: new Date().toISOString(),
    clipPath,
    audioPath,
    outputPath,
    cases: []
  };
  const record = (name, detail) => report.cases.push({ name, detail });
  try {
    const page = await target();
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.open();
    await client.send("Runtime.enable");
    await waitFor(client, "Boolean(window.__avsRuntimeTest)", "API runtime");

    await client.evaluate(
      `window.__avsRuntimeTest.loadClip(${JSON.stringify(clipPath)})`
    );
    let video = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.equal(video.label, "Video");
    assert.equal(video.buttonSelected, true);
    assert.equal(video.preview.width, 1080);
    assert.equal(video.preview.height, 1920);
    assert.ok(video.preview.presentedFrames >= 1);
    record("clip caricata, primo frame e layer Video", video);

    await client.evaluate(
      `window.__avsRuntimeTest.configureExportAudit(${JSON.stringify({
        audioPath,
        coverPath: null,
        title: "Titolo caso reale",
        artist: "Artista caso reale",
        effect: "spectrumBars",
        effectOpacity: 0.7
      })})`
    );
    await client.evaluate("window.__avsRuntimeTest.setClipEndMode('freeze')");
    await client.evaluate("window.__avsRuntimeTest.setProjectFormat('9:16')");
    await client.evaluate(
      "window.__avsRuntimeTest.setExportProfile(1080,1920,30)"
    );
    await client.evaluate("window.__avsRuntimeTest.selectLayerForTest('cover')");
    await client.evaluate(
      "window.__avsRuntimeTest.setBackgroundTransformForTest({x:0.48,y:0.51,scaleX:0.94,scaleY:0.96,rotation:2})"
    );
    video = await client.evaluate("window.__avsRuntimeTest.videoLayerState()");
    assert.equal(video.layer.transform.rotation, 2);
    assert.ok(video.handles?.rotate);
    record("selezione, drag, resize e rotazione", video);

    const timelineFrames = [];
    for (const timestamp of [1, 2, 4, 7.2]) {
      await client.evaluate(
        `window.__avsRuntimeTest.seek(${timestamp})`
      );
      await delay(500);
      timelineFrames.push(
        await client.evaluate("window.__avsRuntimeTest.videoLayerState()")
      );
    }
    assert.ok(
      timelineFrames.every(
        (state, index) =>
          Math.abs(state.preview.currentTime - [1, 2, 4, 7.2][index]) < 0.25
      )
    );
    assert.ok(
      timelineFrames.at(-1).preview.presentedFrames >
        video.preview.presentedFrames
    );
    record(
      "frame video aggiornati lungo gli 8 secondi",
      timelineFrames.map((state) => state.preview)
    );

    const nearEnd = timelineFrames.at(-1);
    assert.ok(nearEnd.preview.currentTime > 7);
    record("video in movimento entro 8 secondi", nearEnd.preview);

    await client.evaluate(
      "window.__avsRuntimeTest.seek(80)"
    );
    await delay(250);
    const frozen = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.equal(frozen.preview.visible, true);
    assert.ok(frozen.preview.currentTime > 7.8);
    record("seek 1:20 mantiene ultimo frame mentre audio continua", frozen.preview);

    await client.evaluate(
      "window.__avsRuntimeTest.stopPlayback()"
    );
    await delay(150);
    const stopped = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.ok(stopped.preview.currentTime < 0.15);
    record("Stop torna al frame zero", stopped.preview);

    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
    );
    const reopened = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.equal(reopened.mediaType, "video");
    assert.equal(reopened.layer.transform.rotation, 2);
    record("save/reopen", reopened);

    await client.evaluate(
      "window.__avsRuntimeTest.clearExportProgressHistory()"
    );
    const exportStarted = Date.now();
    const finalProgress = await client.evaluate(
      `window.__avsRuntimeTest.exportAt(${JSON.stringify(outputPath)})`
    );
    const elapsedSeconds = (Date.now() - exportStarted) / 1000;
    const history = await client.evaluate(
      "window.__avsRuntimeTest.exportProgressHistory()"
    );
    assert.equal(finalProgress.done, true);
    assert.equal(finalProgress.error, undefined);
    assert.ok(history.some((entry) => (entry.frameCurrent || 0) > 0));
    record("export completo 1080x1920", {
      elapsedSeconds,
      finalProgress,
      progressUpdates: history.length,
      firstProgress: history.find((entry) => (entry.frameCurrent || 0) > 0),
      lastProgress: history.at(-1)
    });

    const probe = probeOutput(outputPath);
    assert.equal(probe.videoStreams, 1);
    assert.equal(probe.audioStreams, 1);
    assert.match(probe.duration, /00:04:13/);
    assert.match(probe.dimensions, /1080x1920/);
    const hashes = [0, 1, 80, 252].map((timestamp) => ({
      timestamp,
      md5: frameMd5(outputPath, timestamp)
    }));
    assert.ok(hashes.every((item) => /^MD5=[0-9a-f]{32}$/i.test(item.md5)));
    record("MP4 decodificabile, durata, tracce e frame", { probe, hashes });
    report.elapsedSeconds = elapsedSeconds;
    report.probe = probe;
    report.hashes = hashes;
    report.completedAt = new Date().toISOString();
  } finally {
    try {
      await client?.evaluate("window.close(); true");
    } catch {
      // Il processo viene controllato sotto.
    }
    client?.close();
    await delay(1_000);
    if (electron.exitCode === null) electron.kill();
  }
  report.stderrTail = stderr;
  await fsp.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify({
      passed: report.cases.length,
      report: reportPath,
      output: outputPath,
      elapsedSeconds: report.elapsedSeconds
    })
  );
}

main().catch(async (error) => {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  await fsp.writeFile(
    path.join(resultDirectory, "runtime-failure.txt"),
    detail,
    "utf8"
  );
  console.error(detail);
  process.exitCode = 1;
});
