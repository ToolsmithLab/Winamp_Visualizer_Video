"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.argv[2] || 9343);
const projectPath = path.resolve(process.argv[3]);
const screenshotPath = path.resolve(process.argv[4]);
const reportPath = path.resolve(process.argv[5]);
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
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text
      );
    }
    return result.result.value;
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
  throw new Error("Renderer Electron M3 non trovato.");
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

async function main() {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const target = await findTarget();
  const client = new Client(target.webSocketDebuggerUrl);
  await client.open();
  const checks = {};
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitFor(client, "Boolean(window.__avsRuntimeTest)", "API runtime");
    await waitFor(
      client,
      "window.__avsRuntimeTest.snapshot().projectMStateText === 'Disponibile'",
      "projectM reale"
    );
    checks.controls = await client.evaluate(`(() => [
      '#transform-x','#transform-y','#transform-scale-x','#transform-scale-y',
      '#transform-rotation','#canvas-snapping','#keyframe-property',
      '#keyframe-value','#keyframe-interpolation','#keyframe-toggle',
      '#timeline-zoom','#timeline-scroll','#timeline-snapping'
    ].every((selector) => document.querySelector(selector)))()`);
    assert(checks.controls, "Controlli M3 mancanti.");

    await client.evaluate(`(() => {
      document.querySelector('[data-layer-id="cover"]').click();
      const set = (selector, value) => {
        const input = document.querySelector(selector);
        input.value = String(value);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('#transform-x', 0.41);
      set('#transform-y', 0.33);
      set('#transform-scale-x', 1.2);
      set('#transform-scale-y', 0.8);
      set('#transform-rotation', 45);
      return true;
    })()`);
    checks.numericTransform = await client.evaluate(`(() => {
      const layer = window.__avsRuntimeTest.snapshot().project.layers
        .find((item) => item.id === 'cover');
      return layer.transform;
    })()`);
    assert(checks.numericTransform.x === 0.41, "X numerico non applicato.");
    assert(checks.numericTransform.scaleY === 0.8, "Scala Y non applicata.");
    assert(checks.numericTransform.rotation === 45, "Rotazione non applicata.");

    const bounds = await client.evaluate(`(() => {
      const rect = document.querySelector('#preview').getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })()`);
    const startX = bounds.x + bounds.width * 0.41;
    const startY = bounds.y + bounds.height * 0.33;
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: startX,
      y: startY,
      button: "left",
      clickCount: 1
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: startX + 24,
      y: startY + 18,
      button: "left",
      buttons: 1
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: startX + 24,
      y: startY + 18,
      button: "left",
      clickCount: 1
    });
    checks.afterDrag = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    assert(
      checks.afterDrag.project.layers.find((item) => item.id === "cover")
        .transform.x !== 0.41,
      "Drag canvas non applicato."
    );
    const resize = await client.evaluate(`(() => {
      const canvas = document.querySelector('#preview');
      const rect = canvas.getBoundingClientRect();
      const layer = window.__avsRuntimeTest.snapshot().project.layers
        .find((item) => item.id === 'cover');
      const point = window.__avsRuntimeTest.selectionHandles()['north-west'];
      return {
        x: rect.x + point.x * rect.width / canvas.width,
        y: rect.y + point.y * rect.height / canvas.height,
        scaleX: layer.transform.scaleX,
        scaleY: layer.transform.scaleY
      };
    })()`);
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed", x: resize.x, y: resize.y, button: "left", clickCount: 1
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved", x: resize.x + 20, y: resize.y + 16, button: "left", buttons: 1
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased", x: resize.x + 20, y: resize.y + 16, button: "left", clickCount: 1
    });
    checks.afterResize = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((item)=>item.id==='cover').transform"
    );
    assert(
      checks.afterResize.scaleX !== resize.scaleX ||
        checks.afterResize.scaleY !== resize.scaleY,
      `Resize canvas non applicato: ${JSON.stringify({ resize, after: checks.afterResize })}`
    );
    const rotate = await client.evaluate(`(() => {
      const canvas = document.querySelector('#preview');
      const rect = canvas.getBoundingClientRect();
      const layer = window.__avsRuntimeTest.snapshot().project.layers
        .find((item) => item.id === 'cover');
      const point = window.__avsRuntimeTest.selectionHandles().rotate;
      const x = rect.x + point.x * rect.width / canvas.width;
      const y = rect.y + point.y * rect.height / canvas.height;
      const element = document.elementFromPoint(x, y);
      return {
        x,
        y,
        centerX: rect.x + layer.transform.x * rect.width,
        centerY: rect.y + layer.transform.y * rect.height,
        element: element ? element.tagName + '#' + element.id + '.' + element.className : null,
        rotation: layer.transform.rotation
      };
    })()`);
    for (const offset of [-5, 0, 5]) {
      await client.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: rotate.x + offset,
        y: rotate.y + offset,
        button: "left",
        clickCount: 1
      });
      await client.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: rotate.centerX + 120,
        y: rotate.centerY,
        button: "left",
        buttons: 1
      });
      await client.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: rotate.centerX + 120,
        y: rotate.centerY,
        button: "left",
        clickCount: 1
      });
      checks.afterRotate = await client.evaluate(
        "window.__avsRuntimeTest.snapshot().project.layers.find((item)=>item.id==='cover').transform"
      );
      if (checks.afterRotate.rotation !== rotate.rotation) break;
    }
    assert(
      checks.afterRotate.rotation !== rotate.rotation,
      `Rotazione canvas non applicata: ${JSON.stringify({ rotate, after: checks.afterRotate })}`
    );

    await client.evaluate(`(() => {
      const property = document.querySelector('#keyframe-property');
      property.value = 'x';
      property.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#keyframe-toggle').click();
      const value = document.querySelector('#keyframe-value');
      value.value = '0.25';
      value.dispatchEvent(new Event('change', { bubbles: true }));
      const interpolation = document.querySelector('#keyframe-interpolation');
      interpolation.value = 'ease-in-out';
      interpolation.dispatchEvent(new Event('change', { bubbles: true }));
      const zoom = document.querySelector('#timeline-zoom');
      zoom.value = '4';
      zoom.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    checks.keyframe = await client.evaluate(`(() => {
      const layer = window.__avsRuntimeTest.snapshot().project.layers
        .find((item) => item.id === 'cover');
      return {
        keyframes: layer.keyframes,
        timelineMarkers: document.querySelectorAll('.timeline-keyframe').length,
        source: document.querySelector('#keyframe-source').textContent,
        zoom: document.querySelector('#timeline-zoom').value
      };
    })()`);
    assert(checks.keyframe.keyframes.length >= 1, "Keyframe non creato.");
    assert(checks.keyframe.timelineMarkers >= 1, "Keyframe non visibile.");
    assert(checks.keyframe.zoom === "4", "Zoom timeline non applicato.");

    const beforeLock = await client.evaluate(`(() => {
      document.querySelector('#layer-locked').click();
      const layer = window.__avsRuntimeTest.snapshot().project.layers
        .find((item) => item.id === 'cover');
      const input = document.querySelector('#transform-x');
      input.value = '0.99';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return layer.transform.x;
    })()`);
    const afterLock = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().project.layers.find((item)=>item.id==='cover').transform.x"
    );
    assert(beforeLock === afterLock, "Lock non blocca inspector.");
    await client.evaluate("document.querySelector('#layer-locked').click()");

    const historyBeforeUndo = checks.afterDrag.history.history.undoCount;
    await client.evaluate("document.querySelector('#undo-command').click()");
    await client.evaluate("document.querySelector('#redo-command').click()");
    checks.history = await client.evaluate(
      "window.__avsRuntimeTest.snapshot().history.history"
    );
    assert(checks.history.undoCount >= historyBeforeUndo, "Undo/redo incoerente.");

    await client.evaluate(
      `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
    );
    await client.evaluate(
      `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
    );
    checks.reopened = await client.evaluate(
      "window.__avsRuntimeTest.snapshot()"
    );
    const reopenedCover = checks.reopened.project.layers.find(
      (item) => item.id === "cover"
    );
    assert(reopenedCover.keyframes.length >= 1, "Keyframe perso alla riapertura.");
    assert(!checks.reopened.isDirty, "Riapertura resta dirty.");

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    const report = {
      generatedAt: new Date().toISOString(),
      assertions: {
        projectMReal: true,
        controls: true,
        numericTransform: true,
        directDrag: true,
        directResize: true,
        directRotate: true,
        keyframeInspector: true,
        timelineKeyframe: true,
        timelineZoom: true,
        lock: true,
        undoRedo: true,
        saveReopen: true
      },
      checks: {
        transform: checks.numericTransform,
        keyframeCount: reopenedCover.keyframes.length,
        history: checks.history,
        projectMVersion: checks.reopened.projectMStatus?.version
      },
      projectPath,
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
