"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.argv[2] || 9371);
const coverPath = path.resolve(process.argv[3]);
const projectPath = path.resolve(process.argv[4]);
const screenshotPath = path.resolve(process.argv[5]);
const reportPath = path.resolve(process.argv[6]);
const audioPath = process.argv[7] ? path.resolve(process.argv[7]) : null;
const exportPath = process.argv[8] ? path.resolve(process.argv[8]) : null;
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
  throw new Error("Renderer Electron cover non trovato.");
}

async function waitFor(client, expression, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function viewportPoint(client, canvasPoint) {
  return client.evaluate(`(() => {
    const canvas = document.querySelector('#preview');
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (${canvasPoint.x} / canvas.width) * rect.width,
      y: rect.top + (${canvasPoint.y} / canvas.height) * rect.height
    };
  })()`);
}

async function mouse(client, type, point, modifiers = 0) {
  await client.send("Input.dispatchMouseEvent", {
    type,
    x: point.x,
    y: point.y,
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: 1,
    modifiers
  });
}

async function drag(client, start, end, modifiers = 0) {
  await mouse(client, "mousePressed", start, modifiers);
  await mouse(client, "mouseMoved", end, modifiers);
  await mouse(client, "mouseReleased", end, modifiers);
  await delay(80);
}

async function main() {
  const startedAt = Date.now();
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const target = await findTarget();
  const client = new Client(target.webSocketDebuggerUrl);
  await client.open();
  const checks = {};
  let exportResult = null;
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitFor(client, "Boolean(window.__avsRuntimeTest)", "API runtime");
    await client.evaluate(
      `window.__avsRuntimeTest.configureDemo(${JSON.stringify(
        coverPath
      )},"Artista Cover","Titolo Cover",30)`
    );
    await waitFor(
      client,
      `document.querySelector('#cover-thumbnail').complete &&
       document.querySelector('#cover-thumbnail').naturalWidth > 0`,
      "miniatura cover"
    );

    checks.primaryControls = await client.evaluate(`[
      '#choose-cover','#cover-thumbnail','#cover-visible-primary',
      '#cover-fit-primary','#cover-adapt-primary','#cover-center-primary',
      '#cover-reset-primary','#cover-remove-primary'
    ].every((selector) => Boolean(document.querySelector(selector)))`);
    assert(checks.primaryControls, "Controlli Cover primari mancanti.");

    checks.immediatePreview = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.cover.filePath === ${JSON.stringify(
        coverPath
      )} && !document.querySelector('#cover-file').classList.contains('hidden')`
    );
    assert(checks.immediatePreview, "Preview cover non immediata.");

    checks.fitModes = {};
    for (const mode of ["contain", "fill", "stretch", "original"]) {
      await client.evaluate(`(() => {
        const control = document.querySelector('#cover-fit-primary');
        control.value = ${JSON.stringify(mode)};
        control.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      checks.fitModes[mode] = await client.evaluate(
        `window.__avsRuntimeTest.snapshot().project.cover.fitMode === ${JSON.stringify(
          mode
        )}`
      );
      assert(checks.fitModes[mode], `Modalità ${mode} non applicata.`);
    }

    await client.evaluate(`(() => {
      document.querySelector('[data-layer-id="cover"]').click();
      document.querySelector('#cover-center-primary').click();
      document.querySelector('#cover-adapt-primary').click();
    })()`);
    await client.evaluate(
      `document.querySelector('[data-layer-id="title-text"]').click()`
    );
    const center = await client.evaluate(`(() => {
      const project = window.__avsRuntimeTest.snapshot().project;
      const transform = project.layers.find((item) => item.id === 'cover').transform;
      return {
        x: transform.x * 540 - project.cover.width * 540 * 0.32,
        y: transform.y * 960 - project.cover.height * 960 * 0.32
      };
    })()`);
    const centerViewport = await viewportPoint(client, center);
    await drag(client, centerViewport, centerViewport);
    checks.canvasClickSelection = await client.evaluate(
      `document.querySelector('#inspector-title').textContent === 'Cover'`
    );
    assert(checks.canvasClickSelection, "Click canvas non seleziona la cover.");

    const dragEnd = { x: centerViewport.x + 24, y: centerViewport.y + 18 };
    const moveBefore = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.layers.find((item) => item.id === 'cover').transform`
    );
    await drag(client, centerViewport, dragEnd);
    const moveAfter = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.layers.find((item) => item.id === 'cover').transform`
    );
    checks.drag = moveAfter.x !== moveBefore.x && moveAfter.y !== moveBefore.y;
    assert(checks.drag, "Drag canvas non sposta la cover.");

    let handles = await client.evaluate(
      `window.__avsRuntimeTest.selectionHandles()`
    );
    const resizeStart = await viewportPoint(client, handles["south-east"]);
    await drag(
      client,
      resizeStart,
      { x: resizeStart.x + 32, y: resizeStart.y + 32 },
      8
    );
    const resized = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.layers.find((item) => item.id === 'cover').transform`
    );
    checks.resizeWithShift = Math.abs(resized.scaleX - resized.scaleY) < 1e-9;
    assert(checks.resizeWithShift, "Resize con Shift non mantiene le proporzioni.");

    handles = await client.evaluate(`window.__avsRuntimeTest.selectionHandles()`);
    const rotateStart = await viewportPoint(client, handles.rotate);
    const rotationBefore = resized.rotation;
    await drag(
      client,
      rotateStart,
      { x: rotateStart.x + 48, y: rotateStart.y + 8 }
    );
    const rotated = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.layers.find((item) => item.id === 'cover').transform`
    );
    checks.rotationHandle = rotated.rotation !== rotationBefore;
    assert(checks.rotationHandle, "Maniglia di rotazione non modifica la cover.");

    await client.evaluate(`document.querySelector('#preview').focus()`);
    const cancelCenter = await client.evaluate(`(() => {
      const transform = window.__avsRuntimeTest.snapshot().project.layers
        .find((item) => item.id === 'cover').transform;
      return { x: transform.x * 540, y: transform.y * 960 };
    })()`);
    const cancelStart = await viewportPoint(client, cancelCenter);
    const cancelBefore = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.layers.find((item) => item.id === 'cover').transform`
    );
    await mouse(client, "mousePressed", cancelStart);
    await mouse(client, "mouseMoved", {
      x: cancelStart.x + 40,
      y: cancelStart.y + 30
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape"
    });
    await mouse(client, "mouseReleased", cancelStart);
    await delay(80);
    const cancelAfter = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.layers.find((item) => item.id === 'cover').transform`
    );
    checks.escapeCancel =
      JSON.stringify(cancelAfter) === JSON.stringify(cancelBefore);
    assert(checks.escapeCancel, "Escape non annulla il gesto canvas.");

    const before = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.layers.find((item) => item.id === 'cover').transform`
    );
    await client.evaluate(`(() => {
      const set = (selector, value) => {
        const input = document.querySelector(selector);
        input.value = String(value);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('#transform-x', 0.41);
      set('#transform-y', 0.37);
      set('#transform-scale-x', 1.2);
      set('#transform-scale-y', 0.8);
      set('#transform-rotation', 23);
    })()`);
    const transformed = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.layers.find((item) => item.id === 'cover').transform`
    );
    checks.transform =
      transformed.x === 0.41 &&
      transformed.y === 0.37 &&
      transformed.scaleX === 1.2 &&
      transformed.scaleY === 0.8 &&
      transformed.rotation === 23;
    assert(checks.transform, "Trasformazione cover non applicata.");

    const orderBefore = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.layers.findIndex((item) => item.id === 'cover')`
    );
    await client.evaluate(`document.querySelector('#layer-up').click()`);
    const orderAfter = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.layers.findIndex((item) => item.id === 'cover')`
    );
    checks.layerOrder = orderAfter === orderBefore + 1;
    assert(checks.layerOrder, "Ordine layer cover/effetto non modificato.");

    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
    );
    checks.saveReopen = await client.evaluate(`(() => {
      const project = window.__avsRuntimeTest.snapshot().project;
      const layer = project.layers.find((item) => item.id === 'cover');
      return project.cover.filePath === ${JSON.stringify(coverPath)} &&
        project.cover.fitMode === 'original' &&
        layer.transform.rotation === 23;
    })()`);
    assert(checks.saveReopen, "Save/reopen cover non stabile.");

    await client.evaluate(`document.querySelector('#cover-remove-primary').click()`);
    checks.removed = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.cover.filePath === null`
    );
    assert(checks.removed, "Rimozione cover non applicata.");
    await client.evaluate(`window.__avsRuntimeTest.undo()`);
    await waitFor(
      client,
      `window.__avsRuntimeTest.snapshot().project.cover.filePath === ${JSON.stringify(
        coverPath
      )}`,
      "undo rimozione cover"
    );
    checks.undo = true;
    await client.evaluate(`window.__avsRuntimeTest.redo()`);
    checks.redo = await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.cover.filePath === null`
    );
    assert(checks.redo, "Redo rimozione cover non applicato.");
    await client.evaluate(`window.__avsRuntimeTest.undo()`);

    checks.coverAndEffect = await client.evaluate(`(() => {
      const project = window.__avsRuntimeTest.snapshot().project;
      return project.layers.some((item) => item.kind === 'cover' && item.visible) &&
        project.layers.some((item) => item.kind === 'visualizer' && item.visible);
    })()`);
    assert(checks.coverAndEffect, "Cover ed effetto non convivono.");

    if (audioPath && exportPath) {
      await client.evaluate(
        `window.__avsRuntimeTest.loadAudio(${JSON.stringify(audioPath)})`
      );
      await client.evaluate(`window.__avsRuntimeTest.setExportProfile(180,320,30)`);
      await client.send("Runtime.evaluate", {
        expression: `(() => {
          window.__coverExportResult = null;
          window.__coverExportError = null;
          window.__avsRuntimeTest.exportAt(${JSON.stringify(exportPath)})
            .then((result) => { window.__coverExportResult = result; })
            .catch((error) => { window.__coverExportError = String(error); });
        })()`,
        awaitPromise: false,
        returnByValue: true
      });
      const exportDeadline = Date.now() + 120_000;
      while (Date.now() < exportDeadline) {
        exportResult = await client.evaluate(`window.__coverExportResult`);
        const exportError = await client.evaluate(`window.__coverExportError`);
        if (exportError) {
          throw new Error(`Export MP4 fallito: ${exportError}`);
        }
        if (exportResult?.done === true) break;
        await delay(250);
      }
      checks.mp4Export =
        exportResult?.done === true &&
        exportResult?.percent === 100 &&
        path.resolve(exportResult?.outputPath || "") === exportPath;
      assert(checks.mp4Export, "Export MP4 con cover non completato.");
    }

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          passed: true,
          elapsedSeconds: (Date.now() - startedAt) / 1000,
          checks,
          initialTransform: before,
          finalTransform: transformed,
          screenshotPath,
          projectPath,
          exportPath,
          exportResult
        },
        null,
        2
      )
    );
    await client.evaluate("window.close()");
  } finally {
    client.close();
  }
}

main().catch(async (error) => {
  await fs.mkdir(path.dirname(reportPath), { recursive: true }).catch(() => {});
  await fs.writeFile(
    reportPath,
    JSON.stringify({ passed: false, error: error.stack || String(error) }, null, 2)
  ).catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
