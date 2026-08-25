"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const port = Number(process.argv[2] || 9370);
const preparePath = path.resolve(process.argv[3] || "");
const outputPath = path.resolve(process.argv[4] || "");
if (!preparePath || !outputPath) {
  throw new Error(
    "Uso: phase3-m5-electron-soak.cjs <port> <prepare-report> <output>"
  );
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Client {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
    this.console = [];
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
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method === "Runtime.consoleAPICalled") {
        this.console.push(
          (message.params.args || [])
            .map((item) => item.value ?? item.description ?? "")
            .join(" ")
        );
      }
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
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(
        (response) => response.json()
      );
      const page = pages.find(
        (item) => item.type === "page" && item.url.includes("runtimeTest=1")
      );
      if (page) return page;
    } catch {}
    await delay(250);
  }
  throw new Error("Renderer M5 non trovato.");
}

async function waitFor(client, expression, label, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(150);
  }
  throw new Error(`Timeout ${label}.`);
}

function processSample() {
  const command =
    "$p=Get-Process -ErrorAction SilentlyContinue|" +
    "Where-Object {$_.ProcessName -eq 'electron' -or $_.ProcessName -eq 'Audio Visualizer Studio' -or $_.ProcessName -eq 'projectm-host'};" +
    "$gpu=$null;try{$gpu=($v=(Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction Stop).CounterSamples.CookedValue|" +
    "Measure-Object -Maximum).Maximum}catch{};" +
    "[pscustomobject]@{WorkingSet64=($p|Measure-Object WorkingSet64 -Sum).Sum;" +
    "PrivateBytes=($p|Measure-Object PrivateMemorySize64 -Sum).Sum;" +
    "Handles=($p|Measure-Object HandleCount -Sum).Sum;" +
    "Threads=($p|ForEach-Object{$_.Threads.Count}|Measure-Object -Sum).Sum;" +
    "CpuSeconds=($p|Measure-Object CPU -Sum).Sum;ProcessCount=@($p).Count;" +
    "GpuPercent=$gpu}|ConvertTo-Json -Compress";
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    { encoding: "utf8", timeout: 20_000 }
  );
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return null;
  }
}

async function browserMetrics(client) {
  const response = await client.send("Performance.getMetrics");
  return Object.fromEntries(
    response.metrics.map((item) => [item.name, item.value])
  );
}

async function persist(report) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  const prepared = JSON.parse(await fs.readFile(preparePath, "utf8"));
  const page = await target();
  const client = new Client(page.webSocketDebuggerUrl);
  await client.open();
  await client.send("Runtime.enable");
  await client.send("Performance.enable");
  try {
    await waitFor(client, "Boolean(window.__avsRuntimeTest)", "API runtime");
    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(prepared.projectPath)})`
    );
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
      "projectM"
    );
    const before = await client.evaluate("window.__avsRuntimeTest.snapshot()");
    const preset = await client.evaluate(
      `window.__avsRuntimeTest.createProjectPreset(${JSON.stringify(prepared.projectPresetName)})`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.applyProjectPreset(${JSON.stringify(preset.id)})`
    );
    const afterPreset = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    const audioAsset = afterPreset.project.assets.find(
      (asset) => asset.type === "audio"
    );
    if (!audioAsset) throw new Error("Manifest audio M5 assente.");
    await client.evaluate(
      `window.__avsRuntimeTest.relinkAssetAt(${JSON.stringify(audioAsset.id)},${JSON.stringify(prepared.relinkAudio)},false)`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(prepared.projectPath)})`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.setPresetAutomation(true,30,${prepared.projectSeed})`
    );
    await client.evaluate("window.__avsRuntimeTest.seek(0)");
    await client.evaluate("window.__avsRuntimeTest.togglePlayback()");

    const report = {
      generatedAt: new Date().toISOString(),
      status: "playing",
      prepare: prepared,
      projectPreset: preset,
      historyAfterPreset: afterPreset.history,
      samples: [],
      actions: [],
      errors: [],
      console: []
    };
    const started = Date.now();
    let nextSample = 0;
    let paused = false;
    let resumed = false;
    let seekForward = false;
    let seekBack = false;
    let changedPreset = false;
    while ((Date.now() - started) / 1000 < 602) {
      await delay(1000);
      const elapsed = (Date.now() - started) / 1000;
      if (!paused && elapsed >= 60) {
        await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
        report.actions.push({ elapsed, action: "pause" });
        paused = true;
      } else if (paused && !resumed && elapsed >= 63) {
        await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
        report.actions.push({ elapsed, action: "resume" });
        resumed = true;
      }
      if (!seekForward && elapsed >= 120) {
        await client.evaluate("window.__avsRuntimeTest.seek(240)");
        report.actions.push({ elapsed, action: "seek", target: 240 });
        seekForward = true;
      }
      if (!seekBack && elapsed >= 150) {
        await client.evaluate("window.__avsRuntimeTest.seek(120)");
        report.actions.push({ elapsed, action: "seek", target: 120 });
        seekBack = true;
      }
      if (!changedPreset && elapsed >= 210) {
        await client.evaluate(
          "window.__avsRuntimeTest.presetCommand('next')"
        );
        report.actions.push({ elapsed, action: "preset-next" });
        changedPreset = true;
      }
      if (elapsed + 0.01 < nextSample) continue;
      const snapshot = await client.evaluate(
        "window.__avsRuntimeTest.snapshot()"
      );
      report.samples.push({
        elapsedSeconds: elapsed,
        currentTime: snapshot.currentTime,
        playing: snapshot.playing,
        projectMFrame: snapshot.projectMFrame,
        visiblePlugins: snapshot.project.layers.filter(
          (layer) => layer.kind === "visualizer" && layer.visible
        ).length,
        configuredPlugins: snapshot.project.layers.filter(
          (layer) => layer.kind === "visualizer"
        ).length,
        keyframes: snapshot.project.layers.reduce(
          (total, layer) => total + layer.keyframes.length,
          0
        ),
        process: processSample(),
        browser: await browserMetrics(client)
      });
      report.console = [...client.console];
      await persist(report);
      nextSample += 30;
    }
    const afterPlayback = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    if (afterPlayback.playing) {
      await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
    }
    report.afterPlayback = afterPlayback;
    report.status = "exporting";
    await persist(report);
    const exportPath = path.join(path.dirname(outputPath), "soak-export-600s.mp4");
    report.export = await client.evaluate(
      `window.__avsRuntimeTest.exportAt(${JSON.stringify(exportPath)})`
    );
    report.exportPath = exportPath;
    report.status = "complete";
    report.completedAt = new Date().toISOString();
    report.console = [...client.console];
    report.samples.push({
      elapsedSeconds: (Date.now() - started) / 1000,
      currentTime: (await client.evaluate(
        "window.__avsRuntimeTest.snapshot()"
      )).currentTime,
      process: processSample(),
      browser: await browserMetrics(client),
      afterExport: true
    });
    await persist(report);
    process.stdout.write(
      `${JSON.stringify({
        status: report.status,
        wallClockSeconds: (Date.now() - started) / 1000,
        samples: report.samples.length,
        actions: report.actions,
        exportPath
      }, null, 2)}\n`
    );
  } finally {
    try {
      await client.evaluate("window.avs.projectMShutdown()");
      await client.evaluate("window.close()");
    } catch {}
    client.close();
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await persist({
      generatedAt: new Date().toISOString(),
      status: "failed",
      error: error instanceof Error ? error.stack : String(error)
    });
  } catch {}
  process.exitCode = 1;
});
