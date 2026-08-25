"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const electronPath = path.join(root, "node_modules", "electron", "dist", "electron.exe");
const ffmpegPath = path.join(root, "native", "ffmpeg", "win-x64", "ffmpeg.exe");
const fixtureDirectory = path.resolve(
  process.argv[2] || path.join(root, "test-results", "audio-source")
);
const port = Number(process.argv[3] || 9347);
fs.mkdirSync(fixtureDirectory, { recursive: true });
fs.writeFileSync(
  path.join(fixtureDirectory, "script-started.txt"),
  JSON.stringify({ argv: process.argv, at: new Date().toISOString() }, null, 2),
  "utf8"
);
fs.rmSync(path.join(fixtureDirectory, "runtime-failure.txt"), { force: true });
fs.rmSync(path.join(fixtureDirectory, "runtime-results.json"), { force: true });

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
    const rejectPending = (event) => {
      const message =
        event?.message ||
        `Connessione CDP chiusa (readyState ${this.socket.readyState}).`;
      for (const pending of this.pending.values()) {
        pending.reject(new Error(message));
      }
      this.pending.clear();
    };
    this.socket.addEventListener("close", rejectPending);
    this.socket.addEventListener("error", rejectPending);
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
          "Errore JavaScript nel renderer"
      );
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findTarget() {
  const launchTimeout = Math.max(
    5_000,
    Number(process.env.AVS_RUNTIME_LAUNCH_TIMEOUT_MS || 30_000)
  );
  const deadline = Date.now() + launchTimeout;
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
    await delay(150);
  }
  throw lastError || new Error("Renderer Electron non trovato.");
}

async function waitFor(client, expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await client.evaluate(expression);
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timeout ${label}: ${JSON.stringify(value)}`);
}

function probeOutput(filePath) {
  const result = spawnSync(
    ffmpegPath,
    ["-hide_banner", "-i", filePath],
    { encoding: "utf8", windowsHide: true }
  );
  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  return {
    audioStreams: (
      text.match(
        /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: Audio:/g
      ) || []
    )
      .length,
    videoStreams: (
      text.match(
        /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: Video:/g
      ) || []
    )
      .length,
    duration: text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)?.[0] || "",
    text
  };
}

async function main() {
  const externallyLaunched = process.env.AVS_RUNTIME_EXTERNAL === "1";
  const files = {
    clipAudio: path.join(fixtureDirectory, "clip-con-audio.mp4"),
    clipMuted: path.join(fixtureDirectory, "clip-muta.mp4"),
    externalWav: path.join(fixtureDirectory, "audio-esterno.wav"),
    externalMp3: path.join(fixtureDirectory, "audio-esterno.mp3"),
    project: path.join(fixtureDirectory, "sorgente-audio.avsproject"),
    exportClip: path.join(fixtureDirectory, "export-audio-clip.mp4"),
    exportExternal: path.join(fixtureDirectory, "export-audio-esterno.mp4"),
    exportCanvas: path.join(fixtureDirectory, "export-video-canvas.mp4"),
    exportProjectM: path.join(fixtureDirectory, "export-video-projectm.mp4"),
    report: path.join(fixtureDirectory, "runtime-results.json")
  };
  for (const required of [
    files.clipAudio,
    files.clipMuted,
    files.externalWav,
    files.externalMp3
  ]) {
    if (!fs.existsSync(required)) throw new Error(`Fixture mancante: ${required}`);
  }

  const userData = path.join(fixtureDirectory, "electron-user-data");
  if (!externallyLaunched) {
    await fsp.rm(userData, { recursive: true, force: true });
  }
  await fsp.rm(files.exportClip, { force: true });
  await fsp.rm(files.exportExternal, { force: true });
  await fsp.rm(files.exportCanvas, { force: true });
  await fsp.rm(files.exportProjectM, { force: true });
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const electron = externallyLaunched
    ? null
    : spawn(
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
  electron?.stderr.setEncoding("utf8");
  electron?.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-64_000);
  });

  let client;
  const report = { cases: [], skippedCases: [], outputs: {} };
  const record = (name, detail) => report.cases.push({ name, passed: true, detail });
  const skip = (name, detail) =>
    report.skippedCases.push({ name, skipped: true, detail });
  try {
    const target = await findTarget();
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.open();
    await client.send("Runtime.enable");
    await waitFor(client, "Boolean(window.__avsRuntimeTest)", "API runtime");

    const clipButton = await client.evaluate(`(() => {
      const button = document.querySelector("#simple-choose-clip");
      const audioHeading = document.querySelector("#simple-audio-heading");
      if (!(button instanceof HTMLElement) || !(audioHeading instanceof HTMLElement)) {
        return null;
      }
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        text: button.textContent.replace(/\\s+/g, " ").trim(),
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden",
        beforeAudio:
          Boolean(button.compareDocumentPosition(audioHeading) &
            Node.DOCUMENT_POSITION_FOLLOWING)
      };
    })()`);
    assert.ok(clipButton);
    assert.equal(clipButton.visible, true);
    assert.equal(clipButton.beforeAudio, true);
    assert.match(clipButton.text, /Carica clip video/);
    record("pulsante Carica clip video visibile", clipButton);

    await client.evaluate(
      `window.__avsRuntimeTest.loadClip(${JSON.stringify(files.clipAudio)})`
    );
    let videoState = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.equal(videoState.mediaType, "video");
    assert.equal(videoState.label, "Video");
    assert.equal(videoState.buttonDisabled, false);
    assert.equal(videoState.buttonSelected, true);
    assert.equal(videoState.selectedLayerId, "cover");
    assert.equal(videoState.preview.ready, true);
    assert.ok(videoState.preview.readyState >= 2);
    assert.ok(videoState.preview.presentedFrames >= 1);
    assert.equal(videoState.preview.width, 320);
    assert.equal(videoState.preview.height, 180);
    assert.ok(videoState.handles?.rotate);
    record("primo frame e layer Video selezionato", videoState);

    await client.evaluate(
      "window.__avsRuntimeTest.setBackgroundTransformForTest({x:0.41,y:0.57,scaleX:0.82,scaleY:0.73,rotation:17})"
    );
    videoState = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.equal(videoState.layer.transform.x, 0.41);
    assert.equal(videoState.layer.transform.y, 0.57);
    assert.equal(videoState.layer.transform.scaleX, 0.82);
    assert.equal(videoState.layer.transform.scaleY, 0.73);
    assert.equal(videoState.layer.transform.rotation, 17);
    record("drag resize rotazione Video", videoState.layer.transform);

    assert.equal(
      await client.evaluate("window.__avsRuntimeTest.setAudioSource('clip')"),
      true
    );
    let state = await client.evaluate(
      "window.__avsRuntimeTest.audioSourceState()"
    );
    assert.equal(state.source, "clip");
    assert.equal(state.clipRadio, true);
    assert.equal(state.externalRadio, false);
    assert.equal(state.chooseAudioHidden, true);
    assert.equal(state.waveformPoints, 720);
    assert.ok(state.duration > 2.5 && state.duration < 3.5);
    const clipWaveform = state.waveformFingerprint;
    record("clip con audio / waveform / durata", state);

    await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
    await delay(600);
    state = await client.evaluate("window.__avsRuntimeTest.audioSourceState()");
    if (state.currentTime > 0.1) {
      record("avanzamento riproduzione audio", state);
    } else if (/AUDIO_RENDERER_ERROR/i.test(state.mediaError)) {
      skip(
        "avanzamento audio hardware",
        "Ambiente di test senza renderer audio: AUDIO_RENDERER_ERROR"
      );
    } else {
      throw new Error(
        `Il clock audio non avanza: ${JSON.stringify(state)}`
      );
    }
    assert.equal(state.playing, true);
    videoState = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.equal(videoState.preview.paused, false);
    assert.ok(videoState.preview.presentedFrames > 1);
    record("fotogrammi video in movimento", videoState.preview);
    await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
    const pausedAt = (
      await client.evaluate("window.__avsRuntimeTest.audioSourceState()")
    ).currentTime;
    await delay(250);
    assert.ok(
      Math.abs(
        (
          await client.evaluate("window.__avsRuntimeTest.audioSourceState()")
        ).currentTime - pausedAt
      ) < 0.08
    );
    await client.evaluate("window.__avsRuntimeTest.seek(1.2)");
    await delay(180);
    state = await client.evaluate("window.__avsRuntimeTest.audioSourceState()");
    assert.ok(Math.abs(state.currentTime - 1.2) < 0.12);
    videoState = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.ok(Math.abs(videoState.preview.currentTime - 1.2) < 0.2);
    await client.evaluate("window.__avsRuntimeTest.stopPlayback()");
    state = await client.evaluate("window.__avsRuntimeTest.audioSourceState()");
    assert.equal(state.playing, false);
    assert.ok(state.currentTime < 0.05);
    await delay(120);
    videoState = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.equal(videoState.preview.paused, true);
    assert.ok(videoState.preview.currentTime < 0.15);
    record("play pausa seek stop", state);

    await client.evaluate(
      `window.__avsRuntimeTest.loadAudio(${JSON.stringify(files.externalWav)})`
    );
    state = await client.evaluate("window.__avsRuntimeTest.audioSourceState()");
    assert.equal(state.source, "external");
    assert.equal(state.externalRadio, true);
    assert.equal(state.clipRadio, false);
    assert.equal(state.chooseAudioHidden, false);
    assert.ok(state.duration > 4.5 && state.duration < 5.5);
    assert.notEqual(state.waveformFingerprint, clipWaveform);
    record("cambio clip -> esterno e waveform", state);

    await client.evaluate("window.__avsRuntimeTest.setClipEndMode('loop')");
    await client.evaluate("window.__avsRuntimeTest.seek(4.2)");
    await delay(180);
    videoState = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.equal(videoState.preview.visible, true);
    assert.ok(Math.abs(videoState.preview.currentTime - 1.2) < 0.25);
    record("clip corta Loop", videoState.preview);

    await client.evaluate("window.__avsRuntimeTest.setClipEndMode('freeze')");
    await client.evaluate("window.__avsRuntimeTest.seek(4.2)");
    await delay(180);
    videoState = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.equal(videoState.preview.visible, true);
    assert.ok(videoState.preview.currentTime > 2.8);
    record("clip corta Mantieni ultimo frame", videoState.preview);

    await client.evaluate("window.__avsRuntimeTest.setClipEndMode('black')");
    await client.evaluate("window.__avsRuntimeTest.seek(4.2)");
    await delay(120);
    videoState = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.equal(videoState.preview.visible, false);
    record("clip corta Sfondo nero", videoState.preview);

    assert.equal(
      await client.evaluate("window.__avsRuntimeTest.setAudioSource('clip')"),
      true
    );
    state = await client.evaluate("window.__avsRuntimeTest.audioSourceState()");
    assert.equal(state.source, "clip");
    assert.ok(state.duration < 3.5);
    record("cambio esterno -> clip", state);

    await client.evaluate(
      `window.__avsRuntimeTest.loadAudio(${JSON.stringify(files.externalMp3)})`
    );
    state = await client.evaluate("window.__avsRuntimeTest.audioSourceState()");
    assert.equal(state.source, "external");
    assert.equal(state.waveformPoints, 720);
    record("MP3 esterno", state);

    await client.evaluate(
      `window.__avsRuntimeTest.loadClip(${JSON.stringify(files.clipMuted)})`
    );
    assert.equal(
      await client.evaluate("window.__avsRuntimeTest.setAudioSource('clip')"),
      false
    );
    state = await client.evaluate("window.__avsRuntimeTest.audioSourceState()");
    assert.equal(state.source, "external");
    assert.match(state.error, /non contiene una traccia audio/i);
    record("clip senza audio", state);

    await client.evaluate(
      `window.__avsRuntimeTest.loadClip(${JSON.stringify(files.clipAudio)})`
    );
    await client.evaluate("window.__avsRuntimeTest.setClipEndMode('freeze')");
    await client.evaluate("window.__avsRuntimeTest.setAudioSource('clip')");
    await client.evaluate("window.__avsRuntimeTest.setExportProfile(320,180,30)");
    await client.evaluate(
      "window.__avsRuntimeTest.setBackgroundTransformForTest({x:0.44,y:0.53,scaleX:0.91,scaleY:0.88,rotation:9})"
    );
    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(files.project)})`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(files.project)})`
    );
    state = await client.evaluate("window.__avsRuntimeTest.audioSourceState()");
    assert.equal(state.source, "clip");
    assert.equal(state.clipRadio, true);
    videoState = await client.evaluate(
      "window.__avsRuntimeTest.videoLayerState()"
    );
    assert.equal(videoState.label, "Video");
    assert.equal(videoState.mediaType, "video");
    assert.equal(videoState.layer.transform.x, 0.44);
    assert.equal(videoState.layer.transform.y, 0.53);
    assert.equal(videoState.layer.transform.scaleX, 0.91);
    assert.equal(videoState.layer.transform.scaleY, 0.88);
    assert.equal(videoState.layer.transform.rotation, 9);
    record("save/reopen", { audio: state, video: videoState });

    await client.evaluate(
      `window.__avsRuntimeTest.exportAt(${JSON.stringify(files.exportClip)})`
    );
    const clipProbe = probeOutput(files.exportClip);
    assert.equal(clipProbe.videoStreams, 1);
    assert.equal(clipProbe.audioStreams, 1);
    report.outputs.clip = clipProbe;
    record("export audio clip: una traccia", {
      audioStreams: clipProbe.audioStreams,
      videoStreams: clipProbe.videoStreams,
      duration: clipProbe.duration
    });

    await client.evaluate(
      `window.__avsRuntimeTest.loadAudio(${JSON.stringify(files.externalWav)})`
    );
    await client.evaluate("window.__avsRuntimeTest.setClipEndMode('freeze')");
    await client.evaluate(
      `window.__avsRuntimeTest.exportAt(${JSON.stringify(files.exportExternal)})`
    );
    const externalProbe = probeOutput(files.exportExternal);
    assert.equal(externalProbe.videoStreams, 1);
    assert.equal(externalProbe.audioStreams, 1);
    report.outputs.external = externalProbe;
    record("export audio esterno e clip più corta: una traccia", {
      audioStreams: externalProbe.audioStreams,
      videoStreams: externalProbe.videoStreams,
      duration: externalProbe.duration
    });

    await client.evaluate(
      `window.__avsRuntimeTest.loadClip(${JSON.stringify(files.clipAudio)})`
    );
    await client.evaluate("window.__avsRuntimeTest.setAudioSource('clip')");
    await client.evaluate(
      "window.__avsRuntimeTest.selectSimpleEffect('spectrumBars')"
    );
    await client.evaluate(
      `window.__avsRuntimeTest.exportAt(${JSON.stringify(files.exportCanvas)})`
    );
    const canvasProbe = probeOutput(files.exportCanvas);
    assert.equal(canvasProbe.videoStreams, 1);
    assert.equal(canvasProbe.audioStreams, 1);
    report.outputs.canvas = canvasProbe;
    record("export Video + Canvas", {
      audioStreams: canvasProbe.audioStreams,
      videoStreams: canvasProbe.videoStreams,
      duration: canvasProbe.duration
    });

    await client.evaluate(
      "window.__avsRuntimeTest.selectSimpleEffect('projectM')"
    );
    await client.evaluate(
      `window.__avsRuntimeTest.exportAt(${JSON.stringify(files.exportProjectM)})`
    );
    const projectMProbe = probeOutput(files.exportProjectM);
    assert.equal(projectMProbe.videoStreams, 1);
    assert.equal(projectMProbe.audioStreams, 1);
    report.outputs.projectM = projectMProbe;
    record("export Video + projectM", {
      audioStreams: projectMProbe.audioStreams,
      videoStreams: projectMProbe.videoStreams,
      duration: projectMProbe.duration
    });
  } finally {
    try {
      await client?.evaluate("window.close(); true");
    } catch {
      // Il chiamante conserva un timeout di cleanup sul processo.
    }
    client?.close();
    await delay(1_000);
    if (electron?.exitCode === null) electron.kill();
  }
  report.passed = report.cases.length;
  report.failed = 0;
  report.skipped = report.skippedCases.length;
  report.stderrTail = stderr;
  await fsp.writeFile(files.report, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify({
      passed: report.passed,
      failed: report.failed,
      report: files.report,
      exportClip: files.exportClip,
      exportExternal: files.exportExternal,
      exportCanvas: files.exportCanvas,
      exportProjectM: files.exportProjectM
    })
  );
}

main().catch((error) => {
  fs.writeFileSync(
    path.join(fixtureDirectory, "runtime-failure.txt"),
    error instanceof Error ? error.stack || error.message : String(error),
    "utf8"
  );
  console.error(error);
  process.exitCode = 1;
});
