/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const bench = fs.readFileSync(path.join(__dirname, "..", "scripts", "electron-startup-bench.mjs"), "utf8");

test("the startup benchmark launches the app from the electron workspace", () => {
  // The desktop toolchain moved into electron/, and resolving it from the root
  // package made the script fail before it could launch anything.
  assert.match(bench, /createRequire\(path\.join\(repoRoot, "electron", "package\.json"\)\)/);
  assert.doesNotMatch(bench, /^const require = createRequire\(import\.meta\.url\);$/m);
});

test("the benchmark reports the moment the app replaces the splash", () => {
  assert.match(bench, /"→ app revealed": mark\("view:revealed"\)/);
});

test("two app entries can be measured against each other", () => {
  assert.match(bench, /readArg\("compare", null\)/);
  assert.match(bench, /readArg\("app", null\)/);
});

test("the benchmark strips ELECTRON_RUN_AS_NODE from the launch environment", () => {
  // Terminals and coding agents export it, which turns Electron into plain Node
  // and the app never starts.
  assert.match(bench, /delete env\.ELECTRON_RUN_AS_NODE;/);
});
