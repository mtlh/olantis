/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  readWindowState,
  resolveInitialBounds,
  writeWindowState,
} = require("../electron/window-state.cjs");

const primary = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
const secondary = { workArea: { x: 1920, y: 0, width: 1440, height: 900 } };

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("a first launch opens the default window centred on the primary display", () => {
  assert.deepEqual(resolveInitialBounds(null, [primary]), {
    x: 240,
    y: 80,
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    maximized: false,
  });
});

test("saved bounds on a display that is no longer connected are re-centred", () => {
  // The window was last closed on a monitor that has since been unplugged. It
  // must not reopen entirely off-screen.
  const saved = { x: 3200, y: 300, width: 1200, height: 800, maximized: false };

  assert.deepEqual(resolveInitialBounds(saved, [primary]), {
    x: 240,
    y: 80,
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    maximized: false,
  });
});

test("a window saved on a second display stays on that display", () => {
  const saved = { x: 2000, y: 100, width: 1200, height: 800, maximized: false };

  assert.deepEqual(resolveInitialBounds(saved, [primary, secondary]), {
    x: 2000,
    y: 100,
    width: 1200,
    height: 800,
    maximized: false,
  });
});

test("oversized bounds are clamped to the display's work area", () => {
  const saved = { x: 100, y: 100, width: 3000, height: 2000, maximized: false };

  assert.deepEqual(resolveInitialBounds(saved, [primary]), {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    maximized: false,
  });
});

test("a window is never restored below the minimum usable size", () => {
  const saved = { x: 100, y: 120, width: 400, height: 300, maximized: false };
  const bounds = resolveInitialBounds(saved, [primary]);

  assert.equal(bounds.width, MIN_WINDOW_WIDTH);
  assert.equal(bounds.height, MIN_WINDOW_HEIGHT);
  // Growing back to the minimum must not move a window that already fits.
  assert.equal(bounds.x, 100);
  assert.equal(bounds.y, 120);
});

test("a display smaller than the minimum still gets an on-screen window", () => {
  const small = { workArea: { x: 0, y: 0, width: 800, height: 600 } };
  const bounds = resolveInitialBounds(null, [small]);

  assert.equal(bounds.width, MIN_WINDOW_WIDTH);
  assert.equal(bounds.height, MIN_WINDOW_HEIGHT);
  assert.equal(bounds.x, 0);
  assert.equal(bounds.y, 0);
});

test("maximized is passed through from the saved state", () => {
  const saved = { x: 100, y: 100, width: 1200, height: 800, maximized: true };
  const bounds = resolveInitialBounds(saved, [primary]);

  assert.equal(bounds.maximized, true);
  assert.deepEqual({ ...bounds, maximized: false }, resolveInitialBounds({ ...saved, maximized: false }, [primary]));
});

test("corrupt or incomplete state falls back to the defaults", () => {
  const defaults = resolveInitialBounds(null, [primary]);

  assert.deepEqual(resolveInitialBounds(undefined, [primary]), defaults);
  assert.deepEqual(resolveInitialBounds({}, [primary]), defaults);
  assert.deepEqual(resolveInitialBounds({ x: "0", y: 0, width: 1200, height: 800 }, [primary]), defaults);
  assert.deepEqual(resolveInitialBounds({ x: 0, y: 0, width: 0, height: 0 }, [primary]), defaults);
});

test("with no display information the default size sits at the origin", () => {
  assert.deepEqual(resolveInitialBounds(null, []), {
    x: 0,
    y: 0,
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    maximized: false,
  });
});

test("window state round-trips through disk and ignores corrupt files", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "olantis-window-state-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // The caller points at a file inside userData; the writer also creates any
  // missing parent directory.
  const file = path.join(dir, "nested", "window-state.json");
  const state = { x: 40, y: 60, width: 1200, height: 780, maximized: true };

  writeWindowState(file, state);
  assert.deepEqual(readWindowState(file), state);

  fs.writeFileSync(file, "{ not json");
  assert.equal(readWindowState(file), null);

  fs.writeFileSync(file, JSON.stringify({ x: 0, y: 0, width: "wide", height: 800 }));
  assert.equal(readWindowState(file), null);

  assert.equal(readWindowState(path.join(dir, "missing.json")), null);
});

test("the window restores its saved geometry and writes it back", () => {
  const main = read("electron/main.cjs");

  // Bounds come from the resolver against the displays that exist right now.
  assert.match(main, /windowState\.readWindowState\(windowStateFile\)/);
  assert.match(main, /require\("electron"\)\.screen\.getAllDisplays\(\)/);
  assert.match(main, /minWidth: windowState\.MIN_WINDOW_WIDTH/);
  assert.match(main, /minHeight: windowState\.MIN_WINDOW_HEIGHT/);
  // A maximised session is restored before the first frame is shown.
  assert.match(main, /if \(initialBounds\.maximized\) mainWindow\.maximize\(\)/);
  // Geometry is debounced, and a close flushes it synchronously.
  assert.match(main, /getNormalBounds\(\)/);
  assert.match(main, /setTimeout\(persistWindowState, 500\)/);
  assert.match(main, /mainWindow\.on\("close", \(\) => \{[\s\S]*persistWindowState\(\);/);
});

test("macOS keeps native chrome while other platforms draw their own", () => {
  const main = read("electron/main.cjs");
  const shellJs = read("electron/shell.js");
  const shellCss = read("electron/shell.css");

  assert.match(main, /titleBarStyle: "hiddenInset"/);
  assert.match(main, /trafficLightPosition: \{ x: 15, y: 17 \}/);
  assert.match(main, /\? \{ titleBarStyle: "hiddenInset"[\s\S]*: \{ frame: false \}/);
  // The shell learns its platform through the same query string as its icon.
  assert.match(main, /shellUrl\.searchParams\.set\("platform", process\.platform\)/);
  assert.match(shellJs, /document\.documentElement\.dataset\.platform = platform/);
  assert.match(shellCss, /:root\[data-platform="darwin"\] \.window-controls\s*\{[^}]*display: none/s);
  assert.match(shellCss, /:root\[data-platform="darwin"\] \.titlebar\s*\{[^}]*padding-left: 84px/s);
});

test("the menu and page zoom are wired to the embedded app only", () => {
  const main = read("electron/main.cjs");
  const menu = read("electron/menu.cjs");

  assert.match(main, /nativeTheme\.themeSource = "dark"/);
  assert.match(main, /buildMenuTemplate\(\{[\s\S]*actions: \{ zoom: applyAppZoom \}/);
  assert.match(main, /Menu\.setApplicationMenu\(platformMenu \? Menu\.buildFromTemplate\(platformMenu\) : null\)/);
  assert.match(main, /"before-input-event"/);
  assert.match(main, /"zoom-changed"/);
  assert.match(main, /"context-menu"/);
  // No page-zoom menu roles: the shell page itself must stay at 1x.
  assert.doesNotMatch(menu, /role: "zoomin"/);
  assert.doesNotMatch(menu, /role: "zoomout"/);
});
