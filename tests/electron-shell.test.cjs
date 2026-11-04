/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const shell = read("electron/shell.html");
const shellCss = read("electron/shell.css");
const main = read("electron/main.cjs");

test("desktop startup shows the centred brand mark", () => {
  assert.match(shell, /class="splash"/);
  assert.match(shell, /id="splash-icon"/);
  assert.match(shellCss, /\.splash\s*\{[^}]*place-items: center/s);
});

test("the app view stays hidden until the splash has a page to replace it", () => {
  assert.match(main, /appView\.setVisible\(false\);/, "the view must start hidden behind the startup mark");
  assert.match(main, /"did-finish-load", revealApp/, "a finished load must reveal the app");
  // Without this, a first load that never finishes would leave the mark up
  // forever instead of showing the error page.
  assert.match(main, /"did-fail-load"/);
  assert.match(main, /appView\.setVisible\(true\)/);
});
