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
  // DOM ready is the earlier trigger: the load event also waits for every image
  // and font, which used to keep the startup mark up after the page was ready.
  assert.match(main, /"dom-ready", revealApp/, "a parsed document must reveal the app");
  // Without this, a first load that never finishes would leave the mark up
  // forever instead of showing the error page.
  assert.match(main, /"did-fail-load"/);
  assert.match(main, /appView\.setVisible\(true\)/);
});

test("the startup mark can never swallow clicks meant for the app", () => {
  const splashRule = shellCss.match(/\.splash\s*\{([^}]*)\}/s);
  const cssRules = shellCss.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.ok(splashRule, "the splash rule must exist");
  // Electron applies draggable regions to the whole window, so a drag region in
  // this page eats clicks even where the app view is painted over it. That is
  // what made every button in the shipped app dead.
  assert.doesNotMatch(splashRule[1], /app-region/, "the splash must not be a drag region");
  assert.equal(
    (cssRules.match(/app-region:\s*drag/g) || []).length,
    1,
    "the title bar is the only drag handle",
  );
  assert.match(cssRules, /\.titlebar\s*\{[^}]*-webkit-app-region:\s*drag/s);
});

test("the title bar brand opens home, which is the dashboard when signed in", () => {
  const shellJs = read("electron/shell.js");
  const shellPreload = read("electron/shell-preload.cjs");

  assert.match(shell, /<button[^>]*class="brand"[^>]*id="home-button"/, "the brand must be a real button");
  assert.match(shell, /aria-label="Olantis — home"/);
  // A button inside the drag region would still swallow clicks: the brand needs
  // its own no-drag region before the click listener can ever run.
  assert.match(shellCss, /\.brand\s*\{[^}]*-webkit-app-region:\s*no-drag/s);
  assert.match(shellJs, /getElementById\("home-button"\)[\s\S]*desktop\.goHome\(\)/);
  assert.match(shellPreload, /goHome:\s*\(\)\s*=>\s*ipcRenderer\.send\("olantis:nav:home"\)/);
  assert.match(main, /ipcMain\.on\("olantis:nav:home"/);
  // Signed-in sessions land on /dashboard, signed-out ones on the root URL.
  assert.match(main, /resolveEntryUrl\(APP_URL, cookies\)/);
});

test("the startup mark is removed once the app view is revealed", () => {
  assert.match(main, /webContents\.send\("olantis:app:ready"\)/);
  assert.match(main, /ipcMain\.handle\("olantis:app:is-ready"/);
  assert.match(read("electron/shell-preload.cjs"), /onAppReady/);
  assert.match(read("electron/shell.js"), /getElementById\("splash"\)\?\.remove\(\)/);
});

test("downloaded updates are handed to the app instead of a native dialog", () => {
  assert.doesNotMatch(main, /showMessageBox/, "a background update must not block the window");
  assert.match(main, /preload: path\.join\(__dirname, "app-preload\.cjs"\)/, "the app view needs the update bridge");
  assert.match(main, /"update-downloaded", \(info\) => setUpdateStatus\("ready"/);
  assert.match(main, /ipcMain\.handle\("olantis:update:status"/);
  assert.match(main, /ipcMain\.on\("olantis:update:restart"/);
  assert.match(main, /quitAndInstall\(true, true\)/, "restart keeps the normal install path");

  const appPreload = read("electron/app-preload.cjs");
  assert.match(appPreload, /exposeInMainWorld\("olantisDesktop"/);
  assert.match(appPreload, /"olantis:update:status"/);
  assert.match(appPreload, /"olantis:update:restart"/);
});
