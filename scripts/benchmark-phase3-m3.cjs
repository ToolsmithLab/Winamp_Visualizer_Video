"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createDefaultProject } = require("../dist/shared/project");
const {
  ANIMATABLE_PROPERTIES,
  buildKeyframeIndex,
  evaluateLayerAtTime
} = require("../dist/engine/keyframes/keyframeEngine");
const {
  createTransformGeometry,
  hitTestGeometry
} = require("../dist/engine/transforms/geometry");
const {
  hitTestKeyframe,
  timeToPixel
} = require("../dist/engine/timeline/geometry");

const root = path.resolve(__dirname, "..");
const destination = path.resolve(
  process.argv[2] ||
    path.join(root, "test-results", "phase3-m3", "performance.json")
);

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function measure(callback, iterations = 1000) {
  const values = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    callback(index);
    values.push(performance.now() - start);
  }
  return {
    averageMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    p95Ms: percentile(values, 0.95),
    maximumMs: Math.max(...values)
  };
}

function keyframes(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `bench-${String(index).padStart(6, "0")}`,
    property: ANIMATABLE_PROPERTIES[index % ANIMATABLE_PROPERTIES.length],
    time: index / 60,
    value: (index % 100) / 10,
    interpolation: ["linear", "ease-in", "ease-out", "ease-in-out", "hold"][
      index % 5
    ]
  }));
}

const project = createDefaultProject();
const layer = project.layers.find((item) => item.id === "cover");
const evaluator = {};
for (const count of [1, 100, 1000, 10000]) {
  layer.keyframes = keyframes(count);
  const start = performance.now();
  const index = buildKeyframeIndex(layer.keyframes);
  const indexBuildMs = performance.now() - start;
  evaluator[count] = {
    indexBuildMs,
    evaluate: measure(
      (iteration) => evaluateLayerAtTime(layer, iteration / 30, index),
      count === 10000 ? 300 : 1000
    )
  };
}

const geometry = createTransformGeometry(
  { x: 0.5, y: 0.5, scaleX: 1.3, scaleY: 0.7, rotation: 45 },
  1080,
  1920,
  620,
  680
);
const hitTest = measure((index) =>
  hitTestGeometry(geometry, { x: index % 1080, y: (index * 7) % 1920 })
);

const viewport = { duration: 3600, width: 1800, zoom: 25, scrollTime: 1200 };
const denseTimes = Array.from({ length: 1000 }, (_, index) => 1200 + index / 30);
const timeline = measure((index) => {
  timeToPixel(1200 + (index % 1000) / 30, viewport);
  hitTestKeyframe(index % 1800, denseTimes, viewport, 8);
}, 1000);

const result = {
  generatedAt: new Date().toISOString(),
  machine: {
    platform: process.platform,
    arch: process.arch,
    node: process.version
  },
  evaluator,
  hitTest,
  timeline,
  supportedLimit: 1000,
  stressOnly: 10000,
  thresholds: {
    evaluator1000P95Ms: 2,
    timelineInteractionP95Ms: 16
  },
  passed: {
    evaluator1000: evaluator[1000].evaluate.p95Ms < 2,
    timeline1000: timeline.p95Ms < 16
  }
};

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
