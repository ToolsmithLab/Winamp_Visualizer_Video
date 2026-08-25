"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const [
  ,
  ,
  portArgument,
  coverArgument,
  audioArgument,
  projectArgument,
  exportArgument,
  screenshotArgument,
  reportArgument
] = process.argv;
const port = Number(portArgument || 9381);
const coverPath = path.resolve(coverArgument);
const audioPath = path.resolve(audioArgument);
const projectPath = path.resolve(projectArgument);
const exportPath = path.resolve(exportArgument);
const screenshotPath = path.resolve(screenshotArgument);
const projectMScreenshotPath = screenshotPath.replace(
  /(\.[^.]+)$/,
  "-projectm$1"
);
const stageScreenshotPaths = {
  "9:16": screenshotPath.replace(/(\.[^.]+)$/, "-stage-9x16$1"),
  "1:1": screenshotPath.replace(/(\.[^.]+)$/, "-stage-1x1$1"),
  "4:3": screenshotPath.replace(/(\.[^.]+)$/, "-stage-4x3$1"),
  "16:9": screenshotPath.replace(/(\.[^.]+)$/, "-stage-16x9$1"),
  cover: screenshotPath.replace(/(\.[^.]+)$/, "-layer-cover$1"),
  effect: screenshotPath.replace(/(\.[^.]+)$/, "-layer-effect$1"),
  title: screenshotPath.replace(/(\.[^.]+)$/, "-layer-title$1"),
  artist: screenshotPath.replace(/(\.[^.]+)$/, "-layer-artist$1"),
  resized: screenshotPath.replace(/(\.[^.]+)$/, "-window-resized$1")
};
const reportPath = path.resolve(reportArgument);
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

function assert(value, message) {
  if (!value) throw new Error(message);
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
  throw new Error("Renderer Electron della UI semplice non trovato.");
}

async function waitFor(client, expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
}

async function setControl(client, selector, value, event = "change") {
  await client.evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!control) throw new Error("Controllo mancante: " + ${JSON.stringify(selector)});
    control.value = ${JSON.stringify(value)};
    control.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));
  })()`);
}

async function click(client, selector) {
  await client.evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!control) throw new Error("Controllo mancante: " + ${JSON.stringify(selector)});
    control.click();
  })()`);
}

async function screenshot(client, filePath) {
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  await fs.writeFile(filePath, Buffer.from(shot.data, "base64"));
}

async function canvasPoint(client, normalizedX, normalizedY) {
  return client.evaluate(`(() => {
    const canvas = document.querySelector("#preview");
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + rect.width * ${normalizedX},
      y: rect.top + rect.height * ${normalizedY}
    };
  })()`);
}

async function selectedHandlePoint(client, handle) {
  return client.evaluate(`(() => {
    const canvas = document.querySelector("#preview");
    const rect = canvas.getBoundingClientRect();
    const point = window.__avsRuntimeTest.selectionHandles()?.[${JSON.stringify(handle)}];
    if (!point) throw new Error("Maniglia non disponibile: " + ${JSON.stringify(handle)});
    return {
      x: rect.left + (point.x / canvas.width) * rect.width,
      y: rect.top + (point.y / canvas.height) * rect.height
    };
  })()`);
}

async function selectedCenterPoint(client) {
  const point = await client.evaluate(`(() => {
    const canvas = document.querySelector("#preview");
    const rect = canvas.getBoundingClientRect();
    const handles = window.__avsRuntimeTest.selectionHandles();
    if (!handles) return null;
    const northWest = handles["north-west"];
    const southEast = handles["south-east"];
    const x = (northWest.x + southEast.x) / 2;
    const y = (northWest.y + southEast.y) / 2;
    return {
      x: rect.left + (x / canvas.width) * rect.width,
      y: rect.top + (y / canvas.height) * rect.height
    };
  })()`);
  if (!point) throw new Error("Centro del layer selezionato non disponibile.");
  return point;
}

async function drag(client, start, end, modifiers = 0) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: start.x,
    y: start.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: end.x,
    y: end.y,
    button: "left",
    buttons: 1,
    modifiers
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: end.x,
    y: end.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    modifiers
  });
  await delay(120);
}

async function key(client, type, keyValue, modifiers = 0) {
  await client.send("Input.dispatchKeyEvent", {
    type,
    key: keyValue,
    code: keyValue,
    modifiers
  });
}

async function main() {
  const startedAt = Date.now();
  const checks = {};
  let client;
  try {
    const target = await findTarget();
    client = new Client(target.webSocketDebuggerUrl);
    await client.open();
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Log.enable");
    await client.send("Page.reload", { ignoreCache: true });
    await waitFor(
      client,
      "Boolean(window.avs && window.__avsRuntimeTest)",
      "preload e runtime test"
    );

    checks.oldUiHidden = await client.evaluate(`(() => {
      const selectors = [
        ".left-panel", ".inspector", ".timeline-panel",
        ".top-actions", ".stage-toolbar"
      ];
      return selectors.every((selector) =>
        [...document.querySelectorAll(selector)].every(
          (element) => getComputedStyle(element).display === "none"
        )
      );
    })()`);
    assert(checks.oldUiHidden, "Una sezione della vecchia UI è ancora visibile.");

    checks.initialState = await client.evaluate(`(() => {
      const text = document.querySelector("#canvas-empty-state")?.textContent || "";
      const play = document.querySelector("#play-pause");
      return ["Scegli un'immagine", "Carica il brano", "Scrivi titolo e artista",
        "Scegli un effetto", "Premi Play"].every((item) => text.includes(item)) &&
        play?.disabled === true &&
        document.querySelector("#simple-play-hint")?.textContent === "Carica prima un brano";
    })()`);
    assert(checks.initialState, "Stato iniziale semplice non conforme.");

    const initialAudit = await client.evaluate(
      "window.__avsRuntimeTest.visibleControlsAudit()"
    );
    checks.handlers =
      initialAudit.registered === 56 &&
      initialAudit.connected === 56 &&
      initialAudit.visibleWithoutHandler.length === 0;
    assert(checks.handlers, "Audit handler dei controlli visibili fallito.");

    const initialStage = await client.evaluate(
      "window.__avsRuntimeTest.projectStageState()"
    );
    checks.stageLayout =
      initialStage.format === "9:16" &&
      initialStage.stage &&
      initialStage.viewport &&
      initialStage.panel &&
      initialStage.workspace &&
      initialStage.waveform &&
      initialStage.transport &&
      initialStage.stage.left > initialStage.viewport.left &&
      initialStage.stage.right < initialStage.viewport.right &&
      initialStage.stage.top > initialStage.viewport.top &&
      initialStage.stage.bottom < initialStage.viewport.bottom &&
      initialStage.panel.left > initialStage.stage.right &&
      initialStage.waveform.top >= initialStage.workspace.bottom &&
      initialStage.waveform.top > initialStage.stage.bottom &&
      initialStage.transport.top >= initialStage.waveform.bottom &&
      initialStage.selectionLocked === true &&
      initialStage.guidesVisible === true;
    assert(checks.stageLayout, "Geometria iniziale di stage, pannello e barre non conforme.");

    await client.evaluate(
      `window.__avsRuntimeTest.loadCover(${JSON.stringify(coverPath)})`
    );
    checks.cover = await client.evaluate(`(() => {
      const project = window.__avsRuntimeTest.snapshot().project;
      return project.cover.filePath === ${JSON.stringify(coverPath)} &&
        project.cover.fitMode === "contain" &&
        project.layers.find((layer) => layer.kind === "cover")?.visible === true &&
        !document.querySelector("#simple-cover-file")?.classList.contains("hidden") &&
        Boolean(document.querySelector("#simple-cover-thumbnail")?.src) &&
        Boolean(window.__avsRuntimeTest.selectionHandles());
    })()`);
    assert(checks.cover, "Caricamento o selezione automatica immagine falliti.");

    const coverBefore = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.kind === 'cover').transform"
    );
    const coverStart = await canvasPoint(client, coverBefore.x, coverBefore.y);
    await drag(client, coverStart, {
      x: coverStart.x + 36,
      y: coverStart.y + 24
    });
    const coverAfter = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.kind === 'cover').transform"
    );
    checks.dragCover =
      Math.abs(coverAfter.x - coverBefore.x) > 0.01 &&
      Math.abs(coverAfter.y - coverBefore.y) > 0.01;
    assert(checks.dragCover, "Drag immagine non applicato.");

    const scaleBefore = coverAfter.scaleX;
    const resizeHandle = await selectedHandlePoint(client, "north-west");
    await drag(client, resizeHandle, {
      x: resizeHandle.x + 24,
      y: resizeHandle.y + 24
    });
    const resized = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.kind === 'cover').transform"
    );
    checks.resize =
      Math.abs(resized.scaleX - scaleBefore) > 0.02 &&
      Math.abs(resized.scaleX - resized.scaleY) < 0.000_001;
    assert(checks.resize, "Resize proporzionale immagine non applicato.");

    const rotationBefore = resized.rotation;
    const rotateHandle = await selectedHandlePoint(client, "rotate");
    await drag(client, rotateHandle, {
      x: rotateHandle.x + 100,
      y: rotateHandle.y + 70
    });
    const rotated = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.kind === 'cover').transform"
    );
    checks.rotation = Math.abs(rotated.rotation - rotationBefore) >= 5;
    assert(checks.rotation, "Rotazione immagine non applicata.");

    await client.evaluate(
      `window.__avsRuntimeTest.loadAudio(${JSON.stringify(audioPath)})`
    );
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().duration > 0 && !document.querySelector('#play-pause').disabled",
      "audio caricato e Play abilitato"
    );
    checks.audio = await client.evaluate(`(() => {
      const snapshot = window.__avsRuntimeTest.snapshot();
      return snapshot.duration > 0 &&
        !document.querySelector("#simple-audio-file")?.classList.contains("hidden") &&
        Number(document.querySelector("#simple-seek")?.max) === snapshot.duration;
    })()`);
    assert(checks.audio, "Caricamento brano o waveform non sincronizzati.");

    await setControl(client, "#simple-title", "Titolo semplice", "input");
    await setControl(client, "#simple-title", "Titolo semplice", "change");
    await setControl(client, "#simple-artist", "Artista semplice", "input");
    await setControl(client, "#simple-artist", "Artista semplice", "change");
    checks.textImmediate = await client.evaluate(`(() => {
      const project = window.__avsRuntimeTest.snapshot().project;
      return project.text.title === "Titolo semplice" &&
        project.text.artist === "Artista semplice" &&
        project.layers.find((layer) => layer.kind === "titleText")?.visible &&
        project.layers.find((layer) => layer.kind === "artistText")?.visible;
    })()`);
    assert(checks.textImmediate, "Titolo o artista non aggiornati immediatamente.");

    await setControl(client, "#simple-title-size", "52", "input");
    await setControl(client, "#simple-title-size", "52", "change");
    await setControl(client, "#simple-artist-size", "24", "input");
    await setControl(client, "#simple-artist-size", "24", "change");
    await setControl(client, "#simple-title-opacity", "84", "input");
    await setControl(client, "#simple-title-opacity", "84", "change");
    await setControl(client, "#simple-artist-opacity", "63", "input");
    await setControl(client, "#simple-artist-opacity", "63", "change");
    await setControl(client, "#simple-title-color", "#ffcc33", "input");
    await setControl(client, "#simple-artist-color", "#33ddff", "input");
    checks.textControls = await client.evaluate(`(() => {
      const project = window.__avsRuntimeTest.snapshot().project;
      const title = project.layers.find((layer) => layer.kind === "titleText");
      const artist = project.layers.find((layer) => layer.kind === "artistText");
      return Math.abs(project.text.titleSize * 540 - 52) < 0.01 &&
        Math.abs(project.text.artistSize * 540 - 24) < 0.01 &&
        title?.opacity === 0.84 && artist?.opacity === 0.63 &&
        project.text.titleColor === "#ffcc33" &&
        project.text.artistColor === "#33ddff";
    })()`);
    assert(checks.textControls, "Dimensione, colore o opacità testi non applicati.");

    await click(client, "#simple-layer-cover");
    checks.layerSelectorCover = await client.evaluate(`(() => {
      const snapshot = window.__avsRuntimeTest.snapshot();
      const state = window.__avsRuntimeTest.simpleLayerSelectorState();
      const layer = snapshot.project.layers.find(
        (candidate) => candidate.kind === "cover"
      );
      return state.selectedLayerId === layer?.id &&
        state.buttons.find((button) => button.id === "simple-layer-cover")?.selected;
    })()`);
    assert(checks.layerSelectorCover, "Selettore layer Immagine non attivo.");

    for (const [kind, buttonSelector, id] of [
      ["titleText", "#simple-layer-title", "title"],
      ["artistText", "#simple-layer-artist", "artist"]
    ]) {
      await click(client, buttonSelector);
      await click(client, "#simple-layer-center");
      const selected = await client.evaluate(`(() => {
        const snapshot = window.__avsRuntimeTest.snapshot();
        const state = window.__avsRuntimeTest.simpleLayerSelectorState();
        const layer = snapshot.project.layers.find(
          (candidate) => candidate.kind === ${JSON.stringify(kind)}
        );
        return snapshot.selectedLayerId === layer?.id &&
          state.selectedLayerId === layer?.id &&
          state.buttons.find(
            (button) => button.id === ${JSON.stringify(buttonSelector.slice(1))}
          )?.selected;
      })()`);
      assert(selected, `Selettore layer ${kind} non attivo.`);
      const before = await client.evaluate(
        `window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.kind === ${JSON.stringify(kind)}).transform`
      );
      const otherKind = kind === "titleText" ? "artistText" : "titleText";
      const otherBefore = await client.evaluate(
        `window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.kind === ${JSON.stringify(otherKind)}).transform`
      );
      const start = await canvasPoint(client, before.x, before.y);
      await drag(client, start, { x: start.x + 30, y: start.y - 18 });
      const afterDrag = await client.evaluate(
        `window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.kind === ${JSON.stringify(kind)}).transform`
      );
      const otherAfter = await client.evaluate(
        `window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.kind === ${JSON.stringify(otherKind)}).transform`
      );
      checks[`${id}DragIndependent`] =
        (Math.abs(afterDrag.x - before.x) > 0.008 ||
          Math.abs(afterDrag.y - before.y) > 0.008) &&
        JSON.stringify(otherAfter) === JSON.stringify(otherBefore);
      assert(
        checks[`${id}DragIndependent`],
        `Drag indipendente del layer ${kind} non applicato.`
      );

      const resizeBefore = afterDrag;
      const resizeHandle = await selectedHandlePoint(client, "north-west");
      await drag(
        client,
        resizeHandle,
        { x: resizeHandle.x + 24, y: resizeHandle.y + 16 },
        8
      );
      const afterResize = await client.evaluate(
        `window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.kind === ${JSON.stringify(kind)}).transform`
      );
      checks[`${id}ResizeIndependent`] =
        Math.abs(afterResize.scaleX - resizeBefore.scaleX) > 0.01 &&
        Math.abs(afterResize.scaleX - afterResize.scaleY) < 0.000_001;
      assert(
        checks[`${id}ResizeIndependent`],
        `Resize indipendente del layer ${kind} non applicato.`
      );

      const rotateHandle = await selectedHandlePoint(client, "rotate");
      await drag(client, rotateHandle, {
        x: rotateHandle.x + 70,
        y: rotateHandle.y + 46
      });
      const afterRotate = await client.evaluate(
        `window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.kind === ${JSON.stringify(kind)}).transform`
      );
      checks[`${id}RotateIndependent`] =
        Math.abs(afterRotate.rotation - afterResize.rotation) >= 4;
      assert(
        checks[`${id}RotateIndependent`],
        `Rotazione indipendente del layer ${kind} non applicata.`
      );
    }

    const canvasEffects = [
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
    checks.canvasEffects = {};
    for (const effect of canvasEffects) {
      await setControl(client, "#simple-effect", effect);
      await waitFor(
        client,
        `window.__avsRuntimeTest.snapshot().project.layers.filter(
          (layer) => (layer.kind === "visualizer" || layer.kind === "projectM") && layer.visible
        ).length === 1`,
        `effetto unico ${effect}`
      );
      checks.canvasEffects[effect] = await client.evaluate(`(() => {
        const visible = window.__avsRuntimeTest.snapshot().project.layers.filter(
          (layer) => (layer.kind === "visualizer" || layer.kind === "projectM") && layer.visible
        );
        return visible.length === 1 &&
          (visible[0].plugin?.id || visible[0].pluginId) === ${JSON.stringify(effect)};
      })()`);
      assert(checks.canvasEffects[effect], `Effetto ${effect} non sostituito correttamente.`);
    }

    await setControl(client, "#simple-effect", "spectrumBars");
    await click(client, "#simple-layer-effect");
    checks.layerSelectorEffect = await client.evaluate(`(() => {
      const snapshot = window.__avsRuntimeTest.snapshot();
      const state = window.__avsRuntimeTest.simpleLayerSelectorState();
      const layer = snapshot.project.layers.find(
        (candidate) => candidate.kind === "visualizer" && candidate.visible
      );
      return state.selectedLayerId === layer?.id &&
        state.buttons.find((button) => button.id === "simple-layer-effect")?.selected;
    })()`);
    assert(checks.layerSelectorEffect, "Selettore layer Effetto non attivo.");
    checks.layerOrder = await client.evaluate(`(() => {
      const visible = window.__avsRuntimeTest.snapshot().project.layers
        .filter((layer) => layer.visible)
        .map((layer) => layer.kind);
      const cover = visible.indexOf("cover");
      const effect = visible.indexOf("visualizer");
      const title = visible.indexOf("titleText");
      const artist = visible.indexOf("artistText");
      return cover >= 0 && effect > cover && title > effect && artist > title;
    })()`);
    assert(checks.layerOrder, "Ordine cover -> effetto -> titolo -> artista errato.");

    const transformsBeforeZoom = await client.evaluate(
      "JSON.stringify(window.__avsRuntimeTest.snapshot().project.layers.map((layer) => [layer.id, layer.transform]))"
    );
    await client.evaluate(
      "window.__avsRuntimeTest.setPreviewZoomForTest(0.85, 'fit')"
    );
    await client.evaluate(
      "window.__avsRuntimeTest.setPreviewZoomForTest(1, 'manual')"
    );
    await client.evaluate(
      "window.__avsRuntimeTest.setPreviewZoomForTest(0.7, 'manual')"
    );
    await client.evaluate(
      "window.__avsRuntimeTest.setPreviewZoomForTest(0.8, 'manual')"
    );
    const transformsAfterZoom = await client.evaluate(
      "JSON.stringify(window.__avsRuntimeTest.snapshot().project.layers.map((layer) => [layer.id, layer.transform]))"
    );
    checks.zoomInvariant = transformsBeforeZoom === transformsAfterZoom;
    assert(checks.zoomInvariant, "Lo zoom anteprima ha modificato le coordinate persistenti.");

    checks.effectSelected = await client.evaluate(`(() => {
      const snapshot = window.__avsRuntimeTest.snapshot();
      return snapshot.selectedLayerId === "visualizer-spectrumBars" &&
        Boolean(window.__avsRuntimeTest.selectionHandles());
    })()`);
    assert(checks.effectSelected, "L'effetto scelto non è selezionato sul canvas.");

    const effectBeforeDrag = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.id === 'visualizer-spectrumBars').transform"
    );
    const effectDragStart = await selectedCenterPoint(client);
    await drag(client, effectDragStart, {
      x: effectDragStart.x + 26,
      y: effectDragStart.y - 18
    });
    const effectAfterDrag = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.id === 'visualizer-spectrumBars').transform"
    );
    checks.dragEffect =
      Math.abs(effectAfterDrag.x - effectBeforeDrag.x) > 0.005 ||
      Math.abs(effectAfterDrag.y - effectBeforeDrag.y) > 0.005;
    assert(checks.dragEffect, "Drag dell'effetto dal canvas non applicato.");

    await click(client, "#simple-effect-center");
    const effectCentered = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.id === 'visualizer-spectrumBars').transform"
    );
    const effectResizeHandle = await selectedHandlePoint(client, "north-east");
    effectResizeHandle.x -= 2;
    effectResizeHandle.y += 2;
    await drag(
      client,
      effectResizeHandle,
      { x: effectResizeHandle.x - 24, y: effectResizeHandle.y + 16 },
      8
    );
    const effectAfterResize = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.id === 'visualizer-spectrumBars').transform"
    );
    checks.resizeEffect =
      Math.abs(effectAfterResize.scaleX - effectCentered.scaleX) > 0.01 &&
      Math.abs(effectAfterResize.scaleX - effectAfterResize.scaleY) < 0.000_001;
    assert(checks.resizeEffect, "Resize proporzionale dell'effetto con Shift fallito.");

    const effectRotateHandle = await selectedHandlePoint(client, "rotate");
    await drag(client, effectRotateHandle, {
      x: effectRotateHandle.x + 84,
      y: effectRotateHandle.y + 54
    });
    const effectAfterRotate = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.id === 'visualizer-spectrumBars').transform"
    );
    checks.rotateEffect =
      Math.abs(effectAfterRotate.rotation - effectAfterResize.rotation) >= 4;
    assert(checks.rotateEffect, "Rotazione dell'effetto non applicata.");

    const cancelBefore = JSON.stringify(effectAfterRotate);
    const cancelHandle = await selectedHandlePoint(client, "north-east");
    cancelHandle.x -= 5;
    cancelHandle.y += 5;
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: cancelHandle.x,
      y: cancelHandle.y,
      button: "left",
      buttons: 1,
      clickCount: 1
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: cancelHandle.x + 60,
      y: cancelHandle.y - 40,
      button: "left",
      buttons: 1
    });
    await key(client, "keyDown", "Escape");
    await key(client, "keyUp", "Escape");
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: cancelHandle.x + 60,
      y: cancelHandle.y - 40,
      button: "left",
      buttons: 0,
      clickCount: 1
    });
    await delay(120);
    checks.escapeEffect = await client.evaluate(
      `JSON.stringify(window.__avsRuntimeTest.snapshot().project.layers.find(
        (layer) => layer.id === "visualizer-spectrumBars"
      ).transform) === ${JSON.stringify(cancelBefore)}`
    );
    assert(checks.escapeEffect, "Escape non annulla il gesto sull'effetto.");

    await client.evaluate("document.querySelector('#preview').focus()");
    const nudgeBefore = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.id === 'visualizer-spectrumBars').transform"
    );
    await key(client, "keyDown", "ArrowRight");
    await key(client, "keyUp", "ArrowRight");
    await key(client, "keyDown", "ArrowDown", 8);
    await key(client, "keyUp", "ArrowDown", 8);
    const nudgeAfter = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.id === 'visualizer-spectrumBars').transform"
    );
    checks.keyboardEffect =
      Math.abs(nudgeAfter.x - nudgeBefore.x - 0.001) < 0.000_01 &&
      Math.abs(nudgeAfter.y - nudgeBefore.y - 0.01) < 0.000_01;
    assert(checks.keyboardEffect, "Spostamento effetto con frecce/Shift fallito.");

    await setControl(client, "#simple-effect-opacity", "57", "input");
    await setControl(client, "#simple-effect-opacity", "57", "change");
    checks.effectOpacity = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.id === 'visualizer-spectrumBars').opacity === 0.57"
    );
    assert(checks.effectOpacity, "Opacità separata dell'effetto non applicata.");
    await click(client, "#simple-effect-center");
    await click(client, "#simple-effect-fit");
    await click(client, "#simple-effect-reset");
    checks.effectQuickActions = await client.evaluate(`(() => {
      const layer = window.__avsRuntimeTest.snapshot().project.layers.find(
        (item) => item.id === "visualizer-spectrumBars"
      );
      return layer.transform.x === 0.5 && layer.transform.y === 0.5 &&
        layer.transform.scaleX === 1 && layer.transform.scaleY === 1 &&
        layer.transform.rotation === 0 && layer.opacity === 1;
    })()`);
    assert(checks.effectQuickActions, "Centra/Adatta/Ripristina effetto falliti.");

    await client.evaluate("document.querySelector('#preview').focus()");
    await key(client, "keyDown", "Delete");
    await key(client, "keyUp", "Delete");
    await waitFor(
      client,
      "document.querySelector('#simple-effect').value === 'none'",
      "Delete effetto"
    );
    checks.deleteEffect = true;
    await setControl(client, "#simple-effect", "spectrumBars");
    await click(client, "#simple-effect-remove");
    await waitFor(
      client,
      "document.querySelector('#simple-effect').value === 'none'",
      "Rimuovi effetto"
    );
    checks.removeEffect = true;
    await setControl(client, "#simple-effect", "spectrumBars");

    await setControl(client, "#simple-intensity", "145", "input");
    await setControl(client, "#simple-intensity", "145", "change");
    checks.intensity = await client.evaluate(`(() => {
      const layer = window.__avsRuntimeTest.snapshot().project.layers.find(
        (item) => item.kind === "visualizer" && item.visible
      );
      return layer?.reactive?.intensity === 1.45 &&
        layer?.plugin?.settings?.intensity === 1.45;
    })()`);
    assert(checks.intensity, "Intensità effetto non applicata.");

    await click(client, "#play-pause");
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().playing && window.__avsRuntimeTest.snapshot().currentTime > 0.15",
      "Play reale"
    );
    const timeBeforeSwitch = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().currentTime"
    );
    await setControl(client, "#simple-effect", "orbitingParticles");
    await delay(180);
    checks.playAndSwitch = await client.evaluate(`(() => {
      const snapshot = window.__avsRuntimeTest.snapshot();
      const effect = snapshot.project.layers.find(
        (layer) => layer.kind === "visualizer" && layer.visible
      );
      return snapshot.playing &&
        snapshot.currentTime > ${timeBeforeSwitch} &&
        (effect?.plugin?.id || effect?.pluginId) === "orbitingParticles";
    })()`);
    assert(checks.playAndSwitch, "Play o cambio effetto durante Play fallito.");

    await click(client, "#play-pause");
    await waitFor(
      client,
      "!window.__avsRuntimeTest.snapshot().playing",
      "Pausa"
    );
    const pausedAt = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().currentTime"
    );
    const seekTarget = Math.min(
      await client.evaluate("window.__avsRuntimeTest.snapshot().duration * 0.6"),
      Math.max(0.2, pausedAt + 0.2)
    );
    await setControl(client, "#simple-seek", String(seekTarget), "input");
    checks.pauseAndSeek = await client.evaluate(
      `!window.__avsRuntimeTest.snapshot().playing &&
        Math.abs(window.__avsRuntimeTest.snapshot().currentTime - ${seekTarget}) < 0.08`
    );
    assert(checks.pauseAndSeek, "Pausa o seek non affidabili.");
    await click(client, "#play-pause");
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().playing && window.__avsRuntimeTest.snapshot().currentTime > " +
        String(seekTarget),
      "Ripresa"
    );
    checks.resume = true;

    await setControl(client, "#simple-effect", "projectM");
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStatus?.available === true",
      "projectM disponibile",
      60_000
    );
    await waitFor(
      client,
      "Boolean(window.__avsRuntimeTest.snapshot().projectMFrame)",
      "frame projectM",
      60_000
    );
    checks.projectM = await client.evaluate(`(() => {
      const snapshot = window.__avsRuntimeTest.snapshot();
      return snapshot.project.projectM.enabled &&
        snapshot.project.layers.filter(
          (layer) => (layer.kind === "visualizer" || layer.kind === "projectM") && layer.visible
        ).length === 1 &&
        snapshot.projectMStatus?.available === true &&
        Boolean(snapshot.projectMFrame) &&
        !document.querySelector("#simple-preset-row")?.classList.contains("hidden") &&
        document.querySelector("#simple-preset")?.options.length > 0;
    })()`);
    assert(checks.projectM, "projectM o Preset MilkDrop semplici non disponibili.");

    checks.projectMOverlay = await client.evaluate(`(() => {
      const project = window.__avsRuntimeTest.snapshot().project;
      const layer = project.layers.find((item) => item.kind === "projectM" && item.visible);
      const visible = project.layers.filter((item) => item.visible).map((item) => item.kind);
      const canvas = document.querySelector("#preview");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let black = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] < 5 && pixels[index + 1] < 5 && pixels[index + 2] < 5) black += 1;
      }
      let uniformBrightTopRows = 0;
      let uniformCyanOrPurpleTopRows = 0;
      const rows = Math.min(12, canvas.height);
      for (let y = 0; y < rows; y += 1) {
        let bright = 0;
        let cyanOrPurple = 0;
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 650) bright += 1;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          if (
            (green > 120 && blue > 120 && red < 90) ||
            (red > 110 && blue > 110 && green < 100)
          ) cyanOrPurple += 1;
        }
        if (bright / canvas.width > 0.95) uniformBrightTopRows += 1;
        if (cyanOrPurple / canvas.width > 0.95) uniformCyanOrPurpleTopRows += 1;
      }
      return layer?.blendMode === "screen" &&
        visible.indexOf("projectM") > visible.indexOf("cover") &&
        visible.indexOf("titleText") > visible.indexOf("projectM") &&
        black / (pixels.length / 4) < 0.5 &&
        uniformBrightTopRows === 0 &&
        uniformCyanOrPurpleTopRows === 0;
    })()`);
    assert(
      checks.projectMOverlay,
      "projectM non rispetta overlay, ordine livelli o pulizia framebuffer."
    );

    checks.projectMSelected = await client.evaluate(`(() => {
      const snapshot = window.__avsRuntimeTest.snapshot();
      return snapshot.selectedLayerId === "projectm" &&
        Boolean(window.__avsRuntimeTest.selectionHandles());
    })()`);
    assert(checks.projectMSelected, "projectM non è selezionato sul canvas.");
    const projectMTransformBefore = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((layer) => layer.id === 'projectm').transform"
    );
    const projectMDragStart = await selectedCenterPoint(client);
    await drag(client, projectMDragStart, {
      x: projectMDragStart.x - 22,
      y: projectMDragStart.y + 16
    });
    await setControl(client, "#simple-effect-opacity", "64", "input");
    await setControl(client, "#simple-effect-opacity", "64", "change");
    checks.projectMTransform = await client.evaluate(`(() => {
      const layer = window.__avsRuntimeTest.snapshot().project.layers.find(
        (item) => item.id === "projectm"
      );
      return (Math.abs(layer.transform.x - ${projectMTransformBefore.x}) > 0.005 ||
        Math.abs(layer.transform.y - ${projectMTransformBefore.y}) > 0.005) &&
        layer.opacity === 0.64;
    })()`);
    assert(checks.projectMTransform, "Trasformazione/opacità projectM non applicate.");
    await click(client, "#simple-effect-reset");
    checks.projectMReset = await client.evaluate(`(() => {
      const layer = window.__avsRuntimeTest.snapshot().project.layers.find(
        (item) => item.id === "projectm"
      );
      return layer.transform.x === 0.5 && layer.transform.y === 0.5 &&
        layer.transform.scaleX === 1 && layer.transform.scaleY === 1 &&
        layer.transform.rotation === 0 && layer.opacity === 1 &&
        layer.reactive?.intensity === 1;
    })()`);
    assert(checks.projectMReset, "Ripristino projectM non completo.");

    const projectMScreenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    await fs.writeFile(
      projectMScreenshotPath,
      Buffer.from(projectMScreenshot.data, "base64")
    );

    await client.evaluate("window.__avsRuntimeTest.setSimplePresetTestOptions(5)");
    await click(client, "#simple-preset-button");
    checks.presetMenu5 = await client.evaluate(`(() => {
      const state = window.__avsRuntimeTest.presetComboboxState();
      return state.open && state.count === 5 &&
        state.rect.left >= 0 && state.rect.right <= state.viewport.width &&
        state.rect.top >= 0 && state.rect.bottom <= state.viewport.height;
    })()`);
    assert(checks.presetMenu5, "Menu Preset MilkDrop con 5 elementi non accessibile.");
    await key(client, "keyDown", "Escape");
    await key(client, "keyUp", "Escape");
    await waitFor(
      client,
      "!window.__avsRuntimeTest.presetComboboxState().open",
      "chiusura menu con Escape"
    );

    await client.evaluate("window.__avsRuntimeTest.setSimplePresetTestOptions(37)");
    await click(client, "#simple-preset-button");
    checks.presetMenu37 = await client.evaluate(`(() => {
      const state = window.__avsRuntimeTest.presetComboboxState();
      return state.open && state.count === 37 &&
        (state.opens === "up" || state.opens === "down") &&
        state.rect.top >= 0 && state.rect.bottom <= state.viewport.height;
    })()`);
    assert(checks.presetMenu37, "Menu Preset MilkDrop con 37 elementi tagliato.");
    await click(client, "#simple-preset-button");

    await client.evaluate("window.__avsRuntimeTest.setSimplePresetTestOptions(1137)");
    await click(client, "#simple-preset-button");
    await key(client, "keyDown", "End");
    await key(client, "keyUp", "End");
    await delay(120);
    checks.presetMenu1137 = await client.evaluate(`(() => {
      const state = window.__avsRuntimeTest.presetComboboxState();
      return state.open && state.count === 1137 && state.activeIndex === 1136 &&
        state.scrollTop > 0 &&
        state.rect.top >= 0 && state.rect.bottom <= state.viewport.height;
    })()`);
    assert(checks.presetMenu1137, "Navigazione tastiera/scroll con 1137 preset fallita.");
    await key(client, "keyDown", "Home");
    await key(client, "keyUp", "Home");
    await key(client, "keyDown", "PageDown");
    await key(client, "keyUp", "PageDown");
    await key(client, "keyDown", "Enter");
    await key(client, "keyUp", "Enter");
    await waitFor(
      client,
      "!window.__avsRuntimeTest.presetComboboxState().open",
      "selezione preset con Enter"
    );
    checks.presetKeyboardSelection = true;

    await click(client, "#stop");
    await waitFor(
      client,
      "!window.__avsRuntimeTest.snapshot().playing && window.__avsRuntimeTest.snapshot().currentTime === 0",
      "Stop"
    );
    checks.stop = true;

    await setControl(client, "#simple-effect", "none");
    checks.none = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.layers.every(
        (layer) => (layer.kind !== "visualizer" && layer.kind !== "projectM") || !layer.visible
      )`
    );
    assert(checks.none, "Nessun effetto non rimuove l'effetto corrente.");
    await setControl(client, "#simple-effect", "spectrumBars");

    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
    );
    checks.saveReopen = await client.evaluate(`(() => {
      const project = window.__avsRuntimeTest.snapshot().project;
      return project.text.title === "Titolo semplice" &&
        project.text.artist === "Artista semplice" &&
        project.cover.filePath === ${JSON.stringify(coverPath)} &&
        project.text.titleColor === "#ffcc33" &&
        project.text.artistColor === "#33ddff" &&
        project.layers.filter(
          (layer) => (layer.kind === "visualizer" || layer.kind === "projectM") && layer.visible
        ).length === 1 &&
        project.layers.findIndex((layer) => layer.kind === "cover") <
          project.layers.findIndex((layer) => layer.kind === "visualizer" && layer.visible) &&
        project.layers.findIndex((layer) => layer.kind === "visualizer" && layer.visible) <
          project.layers.findIndex((layer) => layer.kind === "titleText") &&
        project.layers.findIndex((layer) => layer.kind === "titleText") <
          project.layers.findIndex((layer) => layer.kind === "artistText");
    })()`);
    assert(checks.saveReopen, "Save/reopen della UI semplice non conserva il progetto.");

    checks.layerScreenshots = {};
    for (const [name, selector] of [
      ["cover", "#simple-layer-cover"],
      ["effect", "#simple-layer-effect"],
      ["title", "#simple-layer-title"],
      ["artist", "#simple-layer-artist"]
    ]) {
      await click(client, selector);
      const active = await client.evaluate(`(() => {
        const state = window.__avsRuntimeTest.simpleLayerSelectorState();
        const button = state.buttons.find(
          (candidate) => candidate.id === ${JSON.stringify(selector.slice(1))}
        );
        return button?.selected === true && button?.stateText === "ATTIVO";
      })()`);
      assert(active, `Stato ATTIVO non evidente per ${name}.`);
      await screenshot(client, stageScreenshotPaths[name]);
      checks.layerScreenshots[name] = true;
    }

    checks.formats = {};
    for (const [format, expectedWidth, expectedHeight] of [
      ["9:16", 1080, 1920],
      ["1:1", 1080, 1080],
      ["4:3", 1440, 1080],
      ["16:9", 1920, 1080]
    ]) {
      await client.evaluate(
        `window.__avsRuntimeTest.setProjectFormat(${JSON.stringify(format)})`
      );
      await delay(180);
      const state = await client.evaluate(
        "window.__avsRuntimeTest.projectStageState()"
      );
      const stageRatio = state.stage.width / state.stage.height;
      const expectedRatio = expectedWidth / expectedHeight;
      const passed =
        state.format === format &&
        state.canvas.width === expectedWidth &&
        state.canvas.height === expectedHeight &&
        state.export.width === expectedWidth &&
        state.export.height === expectedHeight &&
        Math.abs(stageRatio - expectedRatio) < 0.01 &&
        state.stage.left > state.viewport.left &&
        state.stage.right < state.viewport.right &&
        state.stage.top > state.viewport.top &&
        state.stage.bottom < state.viewport.bottom &&
        state.panel.left > state.stage.right &&
        state.waveform.top > state.stage.bottom &&
        state.transport.top >= state.waveform.bottom;
      assert(passed, `Stage o output non coerente per il formato ${format}.`);
      checks.formats[format] = {
        passed,
        canvas: state.canvas,
        export: state.export,
        stageRatio
      };
      await screenshot(client, stageScreenshotPaths[format]);
    }
    await client.evaluate(
      "window.__avsRuntimeTest.setProjectFormat('9:16')"
    );
    await delay(180);

    await client.evaluate(
      "window.__avsRuntimeTest.setLayerSelectionLockForTest(false)"
    );
    checks.selectionLockToggle = await client.evaluate(
      "window.__avsRuntimeTest.simpleLayerSelectorState().selectionLocked === false"
    );
    await client.evaluate(
      "window.__avsRuntimeTest.setLayerSelectionLockForTest(true)"
    );
    checks.selectionLockToggle =
      checks.selectionLockToggle &&
      (await client.evaluate(
        "window.__avsRuntimeTest.simpleLayerSelectorState().selectionLocked === true"
      ));
    assert(checks.selectionLockToggle, "Blocco selezione non attivabile/disattivabile.");

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1000,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false
    });
    await delay(220);
    const resizedStage = await client.evaluate(
      "window.__avsRuntimeTest.projectStageState()"
    );
    checks.resizedLayout =
      resizedStage.panel.left > resizedStage.stage.right &&
      resizedStage.stage.left > resizedStage.viewport.left &&
      resizedStage.stage.right < resizedStage.viewport.right &&
      resizedStage.stage.top > resizedStage.viewport.top &&
      resizedStage.stage.bottom < resizedStage.viewport.bottom &&
      resizedStage.waveform.top > resizedStage.stage.bottom &&
      resizedStage.transport.top >= resizedStage.waveform.bottom;
    assert(checks.resizedLayout, "Layout ridimensionato sovrappone stage, pannello o barre.");
    await screenshot(client, stageScreenshotPaths.resized);
    await client.send("Emulation.clearDeviceMetricsOverride");
    await delay(180);

    await click(client, "#simple-export-video");
    await waitFor(
      client,
      "!document.querySelector('#simple-export-config').classList.contains('hidden')",
      "dialog export semplice"
    );
    await setControl(client, "#simple-export-ratio", "16:9");
    await setControl(client, "#simple-export-resolution", "720");
    checks.exportDialog = await client.evaluate(
      `document.querySelector("#simple-export-choice")?.textContent.includes("1280 × 720")`
    );
    assert(checks.exportDialog, "Formato o risoluzione export non aggiornati.");
    await click(client, "#simple-export-cancel");

    await client.evaluate("window.__avsRuntimeTest.setExportProfile(180,320,30)");
    const exportResult = await client.evaluate(
      `window.__avsRuntimeTest.exportAt(${JSON.stringify(exportPath)})`
    );
    checks.export =
      exportResult?.done === true &&
      exportResult?.percent === 100 &&
      exportResult?.outputPath === exportPath;
    assert(checks.export, "Export MP4 della UI semplice non completato.");

    const finalAudit = await client.evaluate(
      "window.__avsRuntimeTest.visibleControlsAudit()"
    );
    checks.finalAudit =
      finalAudit.registered === 56 &&
      finalAudit.connected === 56 &&
      finalAudit.visibleWithoutHandler.length === 0;
    assert(checks.finalAudit, "Audit finale dei controlli visibili fallito.");

    await screenshot(client, screenshotPath);
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          passed: true,
          elapsedSeconds: (Date.now() - startedAt) / 1000,
          registeredControls: finalAudit.registered,
          connectedControls: finalAudit.connected,
          visibleControlsAtEnd: finalAudit.visible,
          checks,
          projectPath,
          exportPath,
          screenshotPath,
          projectMScreenshotPath,
          stageScreenshotPaths
        },
        null,
        2
      )
    );
    await client.evaluate("window.close()");
  } catch (error) {
    let diagnostic = null;
    try {
      diagnostic = client
        ? await client.evaluate(`({
            url: location.href,
            avsType: typeof window.avs,
            runtimeTestType: typeof window.__avsRuntimeTest,
            readyState: document.readyState,
            bodyText: document.body?.innerText?.slice(0, 500),
            snapshot: window.__avsRuntimeTest?.snapshot?.(),
            handles: window.__avsRuntimeTest?.selectionHandles?.(),
            presetMenu: window.__avsRuntimeTest?.presetComboboxState?.(),
            protocolEvents: ${JSON.stringify(
              (client?.events ?? [])
                .filter((event) =>
                  ["Runtime.exceptionThrown", "Log.entryAdded"].includes(
                    event.method
                  )
                )
                .slice(-20)
            )}
          })`)
        : null;
    } catch {}
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          passed: false,
          elapsedSeconds: (Date.now() - startedAt) / 1000,
          error: String(error?.stack || error),
          checks,
          diagnostic
        },
        null,
        2
      )
    );
    throw error;
  } finally {
    client?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
