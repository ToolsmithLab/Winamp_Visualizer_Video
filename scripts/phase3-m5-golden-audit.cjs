"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const output = path.resolve(
  process.argv[2] ||
    path.join(root, "test-results", "phase3-m5", "golden-m1-m2.json")
);

function run(script) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script)], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `${script}: exit ${result.status}`);
  }
  return JSON.parse(result.stdout);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function serialized(value) {
  return JSON.stringify(canonical(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(serialized(value)).digest("hex");
}

function fixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(root, "tests", "fixtures", "golden", name), "utf8")
  );
}

function audit(label, script, fixtureName) {
  const expected = fixture(fixtureName);
  const candidates = [run(script), run(script), run(script)];
  const expectedSerialized = serialized(expected);
  const equalFixture = candidates.every(
    (candidate) => serialized(candidate) === expectedSerialized
  );
  const equalRuns = candidates.every(
    (candidate) => serialized(candidate) === serialized(candidates[0])
  );
  return {
    label,
    script,
    fixture: fixtureName,
    equalFixture,
    equalRuns,
    fixtureHash: sha256(expected),
    candidateHashes: candidates.map(sha256)
  };
}

const audits = [
  audit(
    "M1",
    "compute-phase3-m1-golden.cjs",
    "phase2-canvas-golden.json"
  ),
  audit(
    "M2",
    "compute-phase3-m2-golden.cjs",
    "phase3-m2-canvas-golden.json"
  )
];
const report = {
  generatedAt: new Date().toISOString(),
  fixturesUpdated: false,
  passed: audits.every((item) => item.equalFixture && item.equalRuns),
  audits
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 2;
