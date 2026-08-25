"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const test = require("node:test");
const {
  createDefaultProject,
  normalizeProject,
  serializeProject
} = require("../dist/shared/project");
const {
  ANIMATABLE_PROPERTIES,
  adjacentKeyframe,
  buildKeyframeIndex,
  canonicalizeKeyframes,
  evaluateLayerAtTime,
  evaluateProperty,
  evaluateTrack,
  interpolationProgress,
  removeKeyframe,
  upsertKeyframe
} = require("../dist/engine/keyframes/keyframeEngine");
const {
  createTransformGeometry,
  geometryHandles,
  hitTestGeometry,
  hitTestHandle,
  snapValue,
  transformPoint
} = require("../dist/engine/transforms/geometry");
const {
  clampClip,
  frameTime,
  hitTestKeyframe,
  normalizeViewport,
  pixelToTime,
  snapTimelineTime,
  timeToPixel
} = require("../dist/engine/timeline/geometry");
const { ProjectStore } = require("../dist/engine/commands/projectStore");

function layer() {
  return createDefaultProject().layers.find((item) => item.id === "cover");
}

test("draw e hit-test condividono la geometria ruotata a 0/45/90/180 gradi", () => {
  for (const rotation of [0, 45, 90, 180]) {
    const geometry = createTransformGeometry(
      { x: 0.25, y: -0.1, scaleX: 1.4, scaleY: 0.55, rotation },
      1920,
      1080,
      500,
      260
    );
    assert.equal(hitTestGeometry(geometry, geometry.center), true);
    for (const corner of geometry.corners) {
      assert.equal(hitTestGeometry(geometry, corner, 1e-6), true);
    }
    const outside = transformPoint(geometry, {
      x: geometry.width / 2 + 20,
      y: 0
    });
    assert.equal(hitTestGeometry(geometry, outside), false);
  }
});

test("maniglie seguono rotazione, rapporti 16:9/9:16 e zoom preview", () => {
  for (const [width, height, zoom] of [
    [1920, 1080, 1],
    [1080, 1920, 1],
    [540, 960, 0.5],
    [270, 480, 0.25]
  ]) {
    const geometry = createTransformGeometry(
      { x: 0.5, y: 0.5, scaleX: zoom, scaleY: zoom * 1.3, rotation: 45 },
      width,
      height,
      width * 0.4,
      height * 0.2
    );
    for (const [name, point] of Object.entries(geometryHandles(geometry))) {
      assert.equal(hitTestHandle(geometry, point, 0.01), name);
    }
  }
});

test("snapping configurabile usa distanza, poi priorità centro/bordo/elemento/griglia", () => {
  const candidates = [
    { value: 0.5, kind: "grid" },
    { value: 0.5, kind: "element" },
    { value: 0.5, kind: "edge" },
    { value: 0.5, kind: "center" }
  ];
  assert.deepEqual(snapValue(0.504, candidates, 0.01, true), {
    value: 0.5,
    snapped: true,
    guide: 0.5,
    kind: "center"
  });
  assert.equal(snapValue(0.504, candidates, 0.01, false).value, 0.504);
  assert.equal(snapValue(0.7, candidates, 0.01, true).snapped, false);
});

test("tutte le interpolazioni hanno risultati puri e limiti corretti", () => {
  const expected = {
    linear: 0.25,
    "ease-in": 0.0625,
    "ease-out": 0.4375,
    "ease-in-out": 0.125,
    hold: 0
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(interpolationProgress(name, 0.25), value);
    assert.equal(interpolationProgress(name, -10), 0);
    assert.equal(
      interpolationProgress(name, 10),
      name === "hold" ? 0 : 1
    );
  }
});

test("prima del primo keyframe vale base, dopo l'ultimo vale l'ultimo", () => {
  const track = [
    { id: "a", property: "x", time: 2, value: 10, interpolation: "linear" },
    { id: "b", property: "x", time: 4, value: 20, interpolation: "linear" }
  ];
  assert.deepEqual(evaluateTrack(track, 0, 3), { value: 3, source: "base" });
  assert.equal(evaluateTrack(track, 3, 3).value, 15);
  assert.equal(evaluateTrack(track, 4, 3).value, 20);
  assert.equal(evaluateTrack(track, 100, 3).value, 20);
});

test("collision policy sostituisce esplicitamente proprietà/timestamp", () => {
  const first = {
    id: "a",
    property: "x",
    time: 1,
    value: 1,
    interpolation: "linear"
  };
  const second = { ...first, id: "z", value: 9 };
  assert.deepEqual(canonicalizeKeyframes([second, first]), [second]);
  assert.deepEqual(upsertKeyframe([first], second), [second]);
});

test("operazioni keyframe add/edit/move/duplicate/delete e navigazione", () => {
  let keyframes = [];
  keyframes = upsertKeyframe(keyframes, {
    id: "a",
    property: "rotation",
    time: 1,
    value: 10,
    interpolation: "linear"
  });
  keyframes = upsertKeyframe(keyframes, {
    id: "b",
    property: "rotation",
    time: 2,
    value: 20,
    interpolation: "ease-in"
  });
  keyframes = upsertKeyframe(keyframes, { ...keyframes[1], time: 3, value: 30 });
  keyframes = upsertKeyframe(keyframes, {
    ...keyframes[1],
    id: "c",
    time: 4
  });
  assert.equal(adjacentKeyframe(keyframes, "rotation", 3.5, -1).time, 3);
  assert.equal(adjacentKeyframe(keyframes, "rotation", 3.5, 1).time, 4);
  keyframes = removeKeyframe(keyframes, "b");
  assert.deepEqual(keyframes.map((item) => item.id), ["a", "c"]);
});

test("tutte le proprietà obbligatorie sono valutate e normalizzate", () => {
  const target = layer();
  target.reactive = {
    band: "volume",
    sensitivity: 1,
    smoothing: 0.5,
    intensity: 1,
    color: "#fff"
  };
  target.keyframes = ANIMATABLE_PROPERTIES.map((property, index) => ({
    id: `kf-${index}`,
    property,
    time: 0,
    value: property === "opacity" ? 0.5 : property === "scale" ? 2 : index + 1,
    interpolation: "linear"
  }));
  const state = evaluateLayerAtTime(target, 0);
  assert.equal(state.transform.x, 1);
  assert.equal(state.transform.y, 2);
  assert.equal(state.transform.scaleX, 2);
  assert.equal(state.transform.scaleY, 2);
  assert.equal(state.transform.rotation, 4);
  assert.equal(state.opacity, 0.5);
  assert.equal(state.intensity, 6);
});

test("seek avanti/indietro e timestamp comune 30/60 FPS sono identici", () => {
  const target = layer();
  target.keyframes = [
    { id: "a", property: "x", time: 0, value: 0, interpolation: "ease-in-out" },
    { id: "b", property: "x", time: 10, value: 1, interpolation: "linear" }
  ];
  const index = buildKeyframeIndex(target.keyframes);
  const forward = [0, 2.5, 5, 7.5, 10].map(
    (time) => evaluateProperty(index, target, time, "x").value
  );
  const backward = [10, 7.5, 5, 2.5, 0]
    .map((time) => evaluateProperty(index, target, time, "x").value)
    .reverse();
  assert.deepEqual(forward, backward);
  assert.equal(frameTime(5, 30), frameTime(5, 60));
  assert.equal(
    evaluateProperty(index, target, frameTime(5, 30), "x").value,
    evaluateProperty(index, target, frameTime(5, 60), "x").value
  );
});

test("NaN/Infinity sono rifiutati e range sono clampati", () => {
  const base = {
    id: "x",
    property: "opacity",
    time: 0,
    value: 1,
    interpolation: "linear"
  };
  assert.throws(() => upsertKeyframe([], { ...base, value: NaN }), /finito/);
  assert.throws(() => upsertKeyframe([], { ...base, time: Infinity }), /finito/);
  assert.equal(upsertKeyframe([], { ...base, value: 42 })[0].value, 1);
});

test("progetto senza keyframe conserva transform/opacità/intensità base", () => {
  const target = layer();
  target.transform = { x: -0.2, y: 1.4, scaleX: 2, scaleY: 0.4, rotation: 91 };
  target.opacity = 0.37;
  const state = evaluateLayerAtTime(target, 999);
  assert.deepEqual(state.transform, target.transform);
  assert.equal(state.opacity, target.opacity);
  assert.equal(state.intensity, 1);
});

test("round trip schema 6.0 persiste trasformazioni e keyframe canonici", () => {
  const project = createDefaultProject();
  const target = project.layers.find((item) => item.id === "cover");
  target.transform = { x: -0.1, y: 1.1, scaleX: 2, scaleY: 0.5, rotation: 45 };
  target.keyframes = [
    { id: "z", property: "x", time: 3, value: 1, interpolation: "hold" },
    { id: "a", property: "x", time: 1, value: 0, interpolation: "linear" }
  ];
  const reopened = normalizeProject(JSON.parse(serializeProject(project)));
  const restored = reopened.layers.find((item) => item.id === "cover");
  assert.equal(reopened.version, "6.0");
  assert.deepEqual(restored.transform, target.transform);
  assert.deepEqual(restored.keyframes.map((item) => item.id), ["a", "z"]);
});

test("una gesture continua produce un comando; Escape non produce history", () => {
  const store = new ProjectStore(createDefaultProject());
  store.beginTransaction("Drag");
  for (let index = 0; index < 20; index += 1) {
    store.update((project) => {
      project.layers.find((item) => item.id === "cover").transform.x =
        0.5 + index / 100;
    });
  }
  assert.equal(store.commitTransaction(), true);
  assert.equal(store.historySnapshot().history.undoCount, 1);
  const after = store.project.layers.find((item) => item.id === "cover").transform.x;
  assert.equal(store.undo(), true);
  assert.equal(store.redo(), true);
  assert.equal(
    store.project.layers.find((item) => item.id === "cover").transform.x,
    after
  );
  store.beginTransaction("Drag annullato");
  store.update((project) => {
    project.layers.find((item) => item.id === "cover").transform.x = 99;
  });
  assert.equal(store.cancelTransaction(), true);
  assert.equal(store.historySnapshot().history.undoCount, 1);
});

test("tempo/pixel sono inversi con zoom, scroll, durate corte/lunghe", () => {
  for (const viewport of [
    { duration: 0.1, width: 320, zoom: 1, scrollTime: 0 },
    { duration: 36000, width: 1920, zoom: 100, scrollTime: 1200 },
    { duration: 60, width: 1, zoom: 0, scrollTime: -10 }
  ]) {
    const normalized = normalizeViewport(viewport);
    const time = normalized.scrollTime + normalized.duration / normalized.zoom / 2;
    assert.ok(Math.abs(pixelToTime(timeToPixel(time, normalized), normalized) - time) < 1e-9);
  }
});

test("snap timeline gestisce marker, clip, frame e disattivazione", () => {
  const viewport = { duration: 60, width: 600, zoom: 2, scrollTime: 10 };
  const targets = [
    { time: 12, kind: "frame" },
    { time: 12, kind: "clip" },
    { time: 12, kind: "marker" }
  ];
  assert.equal(snapTimelineTime(12.1, viewport, targets, 8, true).target.kind, "marker");
  assert.equal(snapTimelineTime(12.1, viewport, targets, 8, false).time, 12.1);
});

test("hit-test keyframe risolve keyframe vicini e coincidenti stabilmente", () => {
  const viewport = { duration: 10, width: 1000, zoom: 1, scrollTime: 0 };
  assert.equal(hitTestKeyframe(500, [4.99, 5, 5.01], viewport, 2), 1);
  assert.equal(hitTestKeyframe(500, [5, 5], viewport, 2), 0);
  assert.equal(hitTestKeyframe(0, [0, 10], viewport, 2), 0);
  assert.equal(hitTestKeyframe(1000, [0, 10], viewport, 2), 1);
});

test("clip mantiene start < end, clamp e durata minima di un frame a 60 FPS", () => {
  assert.deepEqual(clampClip(-10, 100, 60), { start: 0, end: 60 });
  const tiny = clampClip(4, 4, 10);
  assert.ok(tiny.end > tiny.start);
  assert.ok(tiny.end - tiny.start >= 1 / 60 - 1e-12);
  assert.deepEqual(clampClip(20, 21, 10), {
    start: 10 - 1 / 60,
    end: 10
  });
});

test("1.000 keyframe: evaluator indicizzato resta sotto 2 ms p95", () => {
  const target = layer();
  target.keyframes = Array.from({ length: 1000 }, (_, index) => ({
    id: `kf-${String(index).padStart(4, "0")}`,
    property: ANIMATABLE_PROPERTIES[index % ANIMATABLE_PROPERTIES.length],
    time: index / 30,
    value: (index % 100) / 10,
    interpolation: "ease-in-out"
  }));
  const index = buildKeyframeIndex(target.keyframes);
  const samples = [];
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const start = performance.now();
    evaluateLayerAtTime(target, (iteration % 100) / 3, index);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)];
  assert.ok(p95 < 2, `p95=${p95.toFixed(4)}ms`);
});

test("10.000 keyframe stress resta deterministico e non muta input", () => {
  const target = layer();
  target.keyframes = Array.from({ length: 10000 }, (_, index) => ({
    id: `stress-${String(index).padStart(5, "0")}`,
    property: ANIMATABLE_PROPERTIES[index % ANIMATABLE_PROPERTIES.length],
    time: index / 60,
    value: index % 10,
    interpolation: "linear"
  }));
  const firstInput = structuredClone(target.keyframes);
  const index = buildKeyframeIndex(target.keyframes);
  const first = evaluateLayerAtTime(target, 80.5, index);
  const second = evaluateLayerAtTime(target, 80.5, index);
  assert.deepEqual(first, second);
  assert.deepEqual(target.keyframes, firstInput);
});
