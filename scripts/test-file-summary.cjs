const { spawnSync } = require("node:child_process");
const path = require("node:path");

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("Usage: test-file-summary.cjs <test-file> [...]");
  process.exitCode = 2;
  return;
}

let failedFiles = 0;

for (const file of files) {
  const resolved = path.resolve(file);
  const result = spawnSync(process.execPath, ["--test", resolved], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1"
    },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const tests = output.match(/# tests (\d+)/)?.[1] ?? "?";
  const passed = output.match(/# pass (\d+)/)?.[1] ?? "?";
  const failed = output.match(/# fail (\d+)/)?.[1] ?? "?";
  const skipped = output.match(/# skipped (\d+)/)?.[1] ?? "0";
  const failures = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(
    (match) => match[1]
  );
  const ok = result.status === 0 && failed === "0";

  if (!ok) {
    failedFiles += 1;
  }

  console.log(
    `${ok ? "PASS" : "FAIL"} ${file}: tests=${tests} pass=${passed} fail=${failed} skipped=${skipped}`
  );
  for (const failure of failures) {
    console.log(`  not ok: ${failure}`);
  }
  if (!ok && failures.length === 0) {
    const tail = output.trim().split(/\r?\n/).slice(-12).join("\n");
    console.log(tail);
  }
}

process.exitCode = failedFiles === 0 ? 0 : 1;
