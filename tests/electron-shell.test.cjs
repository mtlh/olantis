/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createLogFile, createLogger } = require("../electron/log.cjs");
const { nextRecoveryDelay } = require("../electron/recovery.cjs");

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

test("the window opens on the startup state, never on an unpainted client area", () => {
  // A window shown at construction is presented before the shell has any pixels,
  // and Windows 11 fills that frame with its own backdrop (#202020): the grey
  // flash at launch. backgroundColor cannot cover it, so the window is created
  // hidden and revealed on the shell's first paint instead.
  assert.doesNotMatch(main, /show: true/, "the window must not be shown before the shell paints");
  assert.match(main, /show: false/);
  assert.match(main, /mainWindow\.once\("ready-to-show", revealWindow\)/);
  assert.match(main, /mainWindow\.show\(\)/);
  // A shell that never paints must still produce a visible window.
  assert.match(main, /"did-fail-load", revealWindow/);
});

test("the window stays transparent until the shell has produced frames", () => {
  // The window is revealed on did-finish-load as well as ready-to-show, and a
  // top-level window that has just been shown can be presented before its first
  // composited frame — Windows paints its own backdrop (#202020) in the
  // meantime. Creating the window at opacity 0 and making it opaque only after
  // the shell renderer has produced animation frames removes that gap.
  assert.match(main, /\bopacity: 0,/);
  assert.match(main, /setOpacity\(1\)/);
  assert.match(main, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  // A renderer stuck before its first frame must not leave the app invisible.
  assert.match(main, /WINDOW_OPACITY_FALLBACK_MS/);
  assert.match(main, /setTimeout\(showOpaque, WINDOW_OPACITY_FALLBACK_MS\)/);
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

test("the shell never updates or restarts itself", () => {
  assert.doesNotMatch(main, /electron-updater/, "no auto-updater module is loaded");
  assert.doesNotMatch(main, /quitAndInstall/, "nothing relaunches the app");
  assert.doesNotMatch(main, /autoInstallOnAppQuit/, "nothing installs behind the user's back");
  assert.doesNotMatch(main, /olantis:update:restart/, "the page cannot trigger a restart");
  assert.doesNotMatch(main, /showMessageBox/, "the shell never blocks the window with an update prompt");
  // The recent-changes read is the only thing bridged into the app page.
  assert.match(main, /fetchGithubJson\("\/releases\?per_page=10"\)/);
  assert.match(main, /ipcMain\.handle\("olantis:changes:check"/);

  const appPreload = read("electron/app-preload.cjs");
  assert.match(appPreload, /exposeInMainWorld\("olantisDesktop"/);
  assert.match(appPreload, /recentChanges: \(\) => ipcRenderer\.invoke\("olantis:changes:check"\)/);
  assert.doesNotMatch(appPreload, /restartToUpdate|checkForUpdates/);
});

test("a download is offered only when the shell itself changed", () => {
  // The release workflow only builds for desktop inputs, but the installed
  // build is still compared with the newest release so a manual rebuild of
  // untouched code cannot produce a download button.
  assert.match(main, /packagedPathsChangedSince\(currentVersion, latest\.release\.version\)/);
  assert.match(main, /packagedPathsChanged\(compare\?\.files\)/);
  assert.match(main, /desktopUpdate\(\{ currentVersion, releases, platform: process\.platform, desktopChanged \}\)/);
});

test("the refresh control shows recent releases with timestamps", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  const panel = read("src/components/DesktopChangesPanel.tsx");

  assert.match(sidebar, /const changesButton = changes\.desktop \?/, "the web app must not render a desktop control");
  assert.match(sidebar, /DesktopChangesPanel/, "the changelog panel is mounted by the refresh control");
  assert.match(sidebar, /update=\{changes\.update\}/, "the panel receives the validated build offer");
  assert.match(sidebar, /onOpenChange=\{\(open\) => \{ if \(open\) checkChanges\(\); \}\}/, "opening the control checks the feed");
  assert.match(panel, /Recent changes/);
  assert.match(panel, /releases\.map/, "the recent releases are listed");
  assert.match(panel, /fmtDateTime\(release\.publishedAt\)/, "each release carries its timestamp");
  assert.match(panel, /state === "ready" && update/, "the offer waits for a finished check");
  assert.match(panel, /update\.downloadUrl/, "the matching installer is linked");
  assert.match(panel, /Download installer/);
  assert.match(panel, /View release/);
  assert.doesNotMatch(panel, /Restart to update/, "nothing relaunches on its own");
});

test("the recent-changes panel can be previewed in an unpackaged shell only", () => {
  // Lets a dev run (and screenshots) paint the panel without hitting GitHub,
  // while a packaged app can never be steered by the env var.
  assert.match(main, /const CHANGES_PREVIEW = !app\.isPackaged && Boolean\(Number\(process\.env\.OLANTIS_CHANGES_PREVIEW/);
  assert.match(main, /function previewChanges\(\)/);
  assert.match(main, /if \(CHANGES_PREVIEW\) return previewChanges\(\);/);
});

test("a first renderer failure schedules a short recovery reload", () => {
  // Nothing has been attempted yet: reload once, quickly.
  assert.deepEqual(nextRecoveryDelay([], 1_000), { recover: true, delayMs: 500 });
  // The caller can pass its own backoff step.
  assert.deepEqual(nextRecoveryDelay([], 1_000, { delayMs: 1500 }), { recover: true, delayMs: 1500 });
});

test("recovery stops once the attempt budget inside the window is spent", () => {
  const now = 10_000;
  const attempts = [now - 4_000, now - 2_000, now - 500];

  const decision = nextRecoveryDelay(attempts, now);

  assert.equal(decision.recover, false, "a crash loop must not reload forever");
  // The oldest attempt leaves the 60s window first: 60s minus its 4s of age.
  assert.equal(decision.delayMs, 56_000);
});

test("attempts that aged out of the window stop counting", () => {
  const now = 100_000;
  const attempts = [now - 61_000, now - 65_000, now - 70_000];

  assert.deepEqual(nextRecoveryDelay(attempts, now), { recover: true, delayMs: 500 });
  // Custom limits are honoured, which is what keeps the helper testable.
  assert.equal(nextRecoveryDelay([now - 1_000, now - 2_000], now, { maxAttempts: 2 }).recover, false);
});

test("the log file rotates and the live file stays bounded", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "olantis-log-"));
  try {
    const logFile = createLogFile({ dir, name: "main.log", maxBytes: 200, maxFiles: 3 });
    const line = "x".repeat(99);

    for (let index = 0; index < 6; index += 1) logFile.write(line);

    assert.ok(fs.existsSync(path.join(dir, "main.log.1")), "the previous file must be kept as .1");
    assert.ok(fs.existsSync(path.join(dir, "main.log.2")), "rotation keeps the last two files");
    assert.ok(
      fs.statSync(path.join(dir, "main.log")).size <= 200,
      "the live file must never grow past maxBytes",
    );
    assert.ok(!fs.existsSync(path.join(dir, "main.log.3")), "maxFiles caps the number kept");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the logger prefixes the timestamp, level and scope", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "olantis-log-"));
  try {
    const logger = createLogger(createLogFile({ dir, name: "main.log" }), "main");
    logger.info("session started", { version: "0.1.0" });

    const text = fs.readFileSync(path.join(dir, "main.log"), "utf8");
    assert.match(text, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z \[info\] \[main\] session started \{"version":"0.1.0"\}$/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the shell has a hidden recovery panel wired to a reload channel", () => {
  assert.match(shell, /id="app-error"[^>]*hidden/, "the panel must start hidden");
  assert.match(shell, /id="app-error-message"/);
  assert.match(shell, /id="app-error-reload"/);
  assert.match(shellCss, /\.app-error\s*\{/);
  assert.match(shellCss, /\.app-error\[hidden\]\s*\{[^}]*display:\s*none/, "hidden must win over the panel layout");

  const shellJs = read("electron/shell.js");
  const shellPreload = read("electron/shell-preload.cjs");

  assert.match(shellJs, /desktop\.onAppError\(showAppError\)/);
  assert.match(shellJs, /desktop\.reloadApp\(\)/);
  assert.match(shellPreload, /onAppError:\s*\(callback\)/);
  assert.match(shellPreload, /reloadApp:\s*\(\)\s*=>\s*ipcRenderer\.send\("olantis:app:reload"\)/);
  assert.match(main, /ipcMain\.on\("olantis:app:reload"/);
  assert.match(main, /send\("olantis:app:error", \{ message: next \}\)|send\("olantis:app:error", \{ message/);
});

test("the main process retries failed loads and recovers dead renderers", () => {
  assert.match(main, /"did-fail-load"[\s\S]*isRetryableLoadError\(code\)[\s\S]*setTimeout\(reloadAppView/);
  assert.match(main, /"render-process-gone"/);
  assert.match(main, /nextRecoveryDelay\(recoveryAttempts, Date\.now\(\)/);
  // A hung renderer is reported, never killed outright.
  assert.match(main, /"unresponsive"/);
  assert.doesNotMatch(main, /webContents\.forcefullyCrashRenderer/);
  // Startup opens the rotating log after Electron is ready, never before.
  assert.match(main, /app\.whenReady\(\)\.then\(\(\) => \{[\s\S]*startFileLogging\(\)/);
});


