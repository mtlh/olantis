/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { app, BrowserWindow, Menu, WebContentsView, ipcMain, session, shell } = require("electron");
const { isAllowedNavigation, isSafeExternalUrl } = require("./url-policy.cjs");
const { resolveEntryUrl } = require("./entry-url.cjs");

const DEFAULT_APP_URL = "https://olantis.vercel.app";
const APP_URL = process.env.OLANTIS_ELECTRON_URL || DEFAULT_APP_URL;
const TITLEBAR_HEIGHT = 46;
// Matches the app's own background (globals.css) so no white frame can show
// through while the remote page loads.
const APP_BACKGROUND = "#050507";
// A window that was shown but never produced compositor frames is lifted out of
// its launch transparency after this long, so a broken renderer cannot leave the
// app invisible.
const WINDOW_OPACITY_FALLBACK_MS = 1000;
const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, "brand-mark.png")
  : path.join(__dirname, "..", "public", "brand", "mark-512.png");

// Startup tracing: opt-in via OLANTIS_STARTUP_TRACE=1. Every mark is emitted as
// one JSON line prefixed with OLANTIS-TRACE so scripts/electron-startup-bench.mjs
// (and anyone with a terminal) can see exactly where launch time goes. The
// helper is a no-op otherwise, so the shipped app pays nothing for it.
const STARTUP_TRACE = Boolean(Number(process.env.OLANTIS_STARTUP_TRACE || 0));
const STARTUP_TRACE_FILE = process.env.OLANTIS_STARTUP_TRACE_FILE || "";
// Dev-only switch for reviewing the update flow without publishing a release:
// OLANTIS_UPDATE_PREVIEW=available|downloading|ready|error seeds the sidebar's
// update state in an unpackaged shell. A packaged app ignores it.
const UPDATE_PREVIEW_STATE = app.isPackaged ? "" : process.env.OLANTIS_UPDATE_PREVIEW || "";
const UPDATE_PREVIEW_NOTES = `## What's Changed
* feat: show the update changelog before relaunching by @mtlh in https://github.com/mtlh/olantis/pull/131
* fix: keep sidebar selections instant by @mtlh in https://github.com/mtlh/olantis/pull/129
* chore: upgrade all dependencies to latest by @mtlh in https://github.com/mtlh/olantis/pull/130

**Full Changelog**: https://github.com/mtlh/olantis/compare/desktop-136...desktop-137`;
// Wait this long after DOM ready before reading the page's paint timings: the
// first frame of a freshly revealed view is composited after the load event.
const PAINT_METRICS_DELAY_MS = 500;
function trace(event, detail) {
  if (!STARTUP_TRACE) return;
  const ms = performance.now();
  const line = `OLANTIS-TRACE ${JSON.stringify({ event, ms: Number(ms.toFixed(1)), at: Date.now(), ...(detail || {}) })}\n`;
  if (STARTUP_TRACE_FILE) {
    // Packaged Windows builds have no stdout to read, so the benchmark asks for
    // a file instead.
    require("node:fs").appendFileSync(STARTUP_TRACE_FILE, line);
    return;
  }
  process.stdout.write(line);
}
trace("main:module-loaded", { url: APP_URL, packaged: app.isPackaged, timeOrigin: Date.now() - performance.now() });

// Read the embedded page's own navigation timings. `timeOrigin` lets the bench
// harness convert page-relative marks onto the app process clock.
const PAGE_METRICS_SNIPPET = `(() => {
  const nav = performance.getEntriesByType("navigation")[0] || {};
  const paint = performance.getEntriesByType("paint").map((entry) => [entry.name, Math.round(entry.startTime)]);
  const fcp = performance.getEntriesByName("first-contentful-paint")[0];
  return {
    href: location.href,
    readyState: document.readyState,
    timeOrigin: Math.round(performance.timeOrigin),
    ttfb: Math.round(nav.responseStart || 0),
    responseEnd: Math.round(nav.responseEnd || 0),
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
    loadEventEnd: Math.round(nav.loadEventEnd || 0),
    fcp: fcp ? Math.round(fcp.startTime) : null,
    paints: paint,
    textLength: ((document.body && document.body.innerText) || "").trim().length,
  };
})()`;

app.setName("Olantis");
app.setAppUserModelId("com.olantis.desktop");

// Lets the startup benchmark run against a throwaway profile so first-launch
// timings (no HTTP cache, no GPU shader cache) can be measured separately.
if (process.env.OLANTIS_ELECTRON_PROFILE) {
  app.setPath("userData", process.env.OLANTIS_ELECTRON_PROFILE);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow;
  let appView;
  let appRevealed = false;
  const { createUpdateState, nextCheckDelayMs, reduceUpdate, toUpdateStatusPayload } = require("./update-machine.cjs");
  // Surfaced in the app's update control through app-preload.cjs.
  let updateState = createUpdateState({ currentVersion: app.getVersion(), enabled: app.isPackaged });
  let updaterInstance;

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  function oncePromise(emitter, event) {
    return new Promise((resolve) => emitter.once(event, resolve));
  }

  // The URL "home" should land on (see entry-url.cjs): signed-in sessions go to
  // the dashboard instead of paying for the landing page render and its
  // redirect first. The title bar's brand uses the same answer per click, so
  // home stays right after signing in or out.
  async function homeUrl() {
    try {
      const cookies = await session.defaultSession.cookies.get({ url: APP_URL });
      const url = resolveEntryUrl(APP_URL, cookies);
      trace("entry:resolved", { url, cookies: cookies.length });
      return url;
    } catch (error) {
      trace("entry:resolve-failed", { message: error instanceof Error ? error.message : String(error) });
      return APP_URL;
    }
  }

  function sameUrl(a, b) {
    try {
      return new URL(a).href === new URL(b).href;
    } catch {
      return a === b;
    }
  }

  async function runSmokeTest(shellReady, appReady) {
    try {
      await Promise.all([shellReady, appReady]);
      const integratedToolbar = await mainWindow.webContents.executeJavaScript(
        '["home-button", "back-button", "forward-button", "minimize-button", "maximize-button", "close-button"].every((id) => document.getElementById(id))',
      );
      const renderedApp = await appView.webContents.executeJavaScript(
        'document.readyState === "complete" && document.body.innerText.trim().length > 0',
      );
      const toolbarIsIntegrated = appView.getBounds().y === TITLEBAR_HEIGHT;
      const brandIconLoaded = await mainWindow.webContents.executeJavaScript(
        '(() => { const img = document.getElementById("brand-icon"); return Boolean(img && img.complete && img.naturalWidth > 0); })()',
      );
      const splashMarkLoaded = await mainWindow.webContents.executeJavaScript(
        // The mark is removed from the DOM once the app view is revealed, so a
        // missing element counts as loaded rather than as a failure.
        '(() => { const img = document.getElementById("splash-icon"); return !img || Boolean(img.complete && img.naturalWidth > 0); })()',
      );
      const appViewVisible = appView.getVisible();
      if (!integratedToolbar || !toolbarIsIntegrated) {
        console.error("Electron smoke test: integrated desktop toolbar was not rendered above the app.");
      }
      if (!renderedApp) console.error("Electron smoke test: Olantis content was not rendered.");
      if (!brandIconLoaded) console.error("Electron smoke test: the Olantis brand icon did not load in the title bar.");
      if (!splashMarkLoaded) console.error("Electron smoke test: the startup mark did not load.");
      if (!appViewVisible) console.error("Electron smoke test: the app view was still hidden behind the startup mark.");
      app.exit(
        renderedApp && integratedToolbar && toolbarIsIntegrated && brandIconLoaded && splashMarkLoaded && appViewVisible
          ? 0
          : 1,
      );
    } catch (error) {
      console.error("Electron smoke test failed:", error);
      app.exit(1);
    }
  }

  function shellWindowFor(event) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window !== mainWindow || window.webContents.isDestroyed()) return null;
    // Only the shell page's own top-level frame may drive the window: a remote
    // iframe, or any other contents that somehow reached this channel, is not
    // the title bar.
    return event.senderFrame === window.webContents.mainFrame ? window : null;
  }

  async function tracePageMetrics(label) {
    if (!STARTUP_TRACE || !appView) return;
    try {
      const metrics = await appView.webContents.executeJavaScript(PAGE_METRICS_SNIPPET);
      trace(`view:metrics:${label}`, metrics);
    } catch (error) {
      trace(`view:metrics:${label}:error`, { message: error instanceof Error ? error.message : String(error) });
    }
  }

  // Reliability: a rotating file under the OS log directory, so a failure on a
  // machine with no terminal still leaves a trail. Logging is best-effort and
  // can never throw into the handler that reported the problem.
  let logger;
  let appErrorMessage = null;

  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function startFileLogging() {
    try {
      const { createLogFile, createLogger } = require("./log.cjs");
      logger = createLogger(createLogFile({ dir: app.getPath("logs") }), "main");
    } catch (error) {
      console.error("[main] file logging is unavailable:", errorMessage(error));
    }
  }

  function logInfo(message, detail) {
    if (logger) logger.info(message, detail);
  }

  function logWarn(message, detail) {
    if (logger) logger.warn(message, detail);
    else console.warn("[main]", message, detail ?? "");
  }

  function logError(message, detail) {
    if (logger) logger.error(message, detail);
    else console.error("[main]", message, detail ?? "");
  }

  // The error panel lives in the shell page, underneath the app view, so the
  // view is hidden while the panel is up and put back once the app recovers.
  function setAppError(message) {
    const next = typeof message === "string" && message.length > 0 ? message : null;
    if (next === appErrorMessage) return;
    appErrorMessage = next;
    if (appView && !appView.webContents.isDestroyed()) {
      appView.setVisible(next === null && appRevealed);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("olantis:app:error", { message: next });
    }
    if (next === null) logInfo("app error cleared");
    else logWarn("app error shown", { message: next });
  }

  // Re-point the embedded app at the same destination a fresh launch would use.
  // The entry URL is resolved per reload so a sign-in or sign-out is respected.
  function reloadAppView() {
    if (!appView || appView.webContents.isDestroyed()) return;
    void homeUrl()
      .then((url) => {
        if (!appView || appView.webContents.isDestroyed()) return undefined;
        return appView.webContents.loadURL(url);
      })
      .catch((error) => logError("app reload failed", { message: errorMessage(error) }));
  }

  ipcMain.on("olantis:window:minimize", (event) => shellWindowFor(event)?.minimize());
  ipcMain.on("olantis:window:toggle-maximize", (event) => {
    const window = shellWindowFor(event);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.on("olantis:window:close", (event) => shellWindowFor(event)?.close());
  ipcMain.handle("olantis:window:is-maximized", (event) => Boolean(shellWindowFor(event)?.isMaximized()));
  // The shell asks once after loading, so a reveal that happened before it was
  // listening still tears the startup mark down.
  ipcMain.handle("olantis:app:is-ready", (event) => Boolean(shellWindowFor(event)) && appRevealed);
  // The error panel's Reload action. The shell only ever asks for this, never
  // for an arbitrary URL.
  ipcMain.on("olantis:app:reload", (event) => {
    if (!shellWindowFor(event)) return;
    logInfo("app reload requested from the shell");
    setAppError(null);
    reloadAppView();
  });

  function appViewWindowFor(event) {
    if (!appView || appView.webContents.isDestroyed() || event.sender !== appView.webContents) return false;
    // The update bridge belongs to the app page itself, not to a frame it
    // embeds: a third-party iframe must not read or trigger an install.
    return event.senderFrame === appView.webContents.mainFrame;
  }

  ipcMain.handle("olantis:update:status", (event) =>
    toUpdateStatusPayload(appViewWindowFor(event) ? updateState : createUpdateState({ enabled: false })),
  );
  // Manual "check for updates" from the sidebar. The periodic check keeps
  // running on its own; this just lets someone ask early. It resolves once the
  // check finishes, which is exactly how long the control spins.
  ipcMain.handle("olantis:update:check", async (event) => {
    if (!appViewWindowFor(event) || !updaterInstance) return toUpdateStatusPayload(updateState);
    try {
      await updaterInstance.checkForUpdates();
    } catch (error) {
      console.error("[updater] check failed:", error?.message ?? error);
    }
    return toUpdateStatusPayload(updateState);
  });
  ipcMain.on("olantis:update:restart", (event) => {
    if (!appViewWindowFor(event)) return;
    installUpdate();
  });

  function navigationHistory() {
    return appView?.webContents.navigationHistory;
  }

  function sendNavigationState() {
    const history = navigationHistory();
    if (!mainWindow || mainWindow.isDestroyed() || !history) return;
    mainWindow.webContents.send("olantis:nav:state", {
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
    });
  }

  ipcMain.on("olantis:nav:back", (event) => {
    if (!shellWindowFor(event)) return;
    const history = navigationHistory();
    if (history?.canGoBack()) history.goBack();
  });
  ipcMain.on("olantis:nav:forward", (event) => {
    if (!shellWindowFor(event)) return;
    const history = navigationHistory();
    if (history?.canGoForward()) history.goForward();
  });
  // The title bar brand. Reading the cookies per click (rather than reusing the
  // launch URL) keeps home correct after signing in or out inside the window.
  ipcMain.on("olantis:nav:home", (event) => {
    if (!shellWindowFor(event) || !appView || appView.webContents.isDestroyed()) return;
    void homeUrl().then((url) => {
      if (!appView || appView.webContents.isDestroyed()) return;
      // A query string means a drill-down (/dashboard?holding=…), so only an
      // exact match counts as already home. That makes a repeated click a no-op
      // without reloading the page, while still clearing a selection.
      if (sameUrl(appView.webContents.getURL(), url)) return;
      void appView.webContents.loadURL(url);
    });
  });
  ipcMain.handle("olantis:nav:state", (event) => {
    if (!shellWindowFor(event)) return { canGoBack: false, canGoForward: false };
    const history = navigationHistory();
    return { canGoBack: Boolean(history?.canGoBack()), canGoForward: Boolean(history?.canGoForward()) };
  });

  // Zoom applies to the embedded app only: the shell page's title bar has fixed
  // pixel dimensions and must stay at 1x (see electron/shell.css).
  const ZOOM_MIN_LEVEL = -3;
  const ZOOM_MAX_LEVEL = 3;
  const ZOOM_STEP = 0.5;

  function applyAppZoom(direction) {
    if (!appView || appView.webContents.isDestroyed()) return;
    const contents = appView.webContents;
    if (direction === "reset") {
      contents.setZoomLevel(0);
      return;
    }
    const step = direction === "in" ? ZOOM_STEP : -ZOOM_STEP;
    const level = Math.min(ZOOM_MAX_LEVEL, Math.max(ZOOM_MIN_LEVEL, contents.getZoomLevel() + step));
    contents.setZoomLevel(level);
  }

  function syncAppBounds() {
    if (!mainWindow || !appView) return;
    const { width, height } = mainWindow.getContentBounds();
    appView.setBounds({
      x: 0,
      y: TITLEBAR_HEIGHT,
      width,
      height: Math.max(0, height - TITLEBAR_HEIGHT),
    });
  }

  function installWindowControls() {
    const template = path.join(__dirname, "shell-preload.cjs");
    const shellHtml = path.join(__dirname, "shell.html");
    const { buildContextMenuTemplate } = require("./context-menu.cjs");

    // The embedded app is the slow half of a launch, so its view is created and
    // pointed at the app before the shell window exists. The request, the
    // renderer process and the network stack all get going while the window
    // itself is still being constructed. The session cookies are read up front
    // for the same reason: that read finishes inside the time it takes to bring
    // a renderer process up, so it never sits on the launch path.
    const entryUrl = homeUrl();
    trace("view:create");
    appView = new WebContentsView({
      webPreferences: {
        // Only the update bridge is exposed to the remote page.
        preload: path.join(__dirname, "app-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Nothing in the app is spell-checked, and skipping the dictionary load
        // keeps it out of renderer start-up.
        spellcheck: false,
        webSecurity: true,
      },
    });
    // WebContentsView paints opaque white by default, and the remote page is
    // still loading when the window appears. Keep the view's backdrop dark so
    // launching shows black chrome instead of a white flash.
    appView.setBackgroundColor(APP_BACKGROUND);
    // Hidden until the page is ready: shell.html paints a centred brand mark
    // underneath, and the view is revealed on top of it once loading finishes.
    appView.setVisible(false);
    trace("view:created");

    // Show the loaded page over the startup mark. A failed first load still
    // reveals, so the user sees the error page instead of a mark that never
    // goes away.
    const revealApp = () => {
      if (appRevealed) return;
      if (!appView || appView.webContents.isDestroyed()) return;
      appView.setVisible(true);
      appRevealed = true;
      // Drop the startup mark for good. The splash lives in the shell page
      // underneath this view, and leaving it in the DOM keeps a full-window
      // element around that can swallow input (see shell.css).
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("olantis:app:ready");
      }
      trace("view:revealed");
    };
    // Reveal as soon as the document is parsed and its stylesheets are in.
    // "did-finish-load" also waits for every image, font and lazily-inserted
    // asset, so a slow subresource used to keep the startup mark on screen long
    // after the page was ready to look at. It stays as the fallback for a page
    // that never reaches dom-ready.
    appView.webContents.once("dom-ready", revealApp);
    appView.webContents.once("did-finish-load", revealApp);

    // Reliability: crashes, hangs and failed loads share one recovery path.
    // nextRecoveryDelay bounds how often a crash loop may reload; failed loads
    // use the same backoff table and are explained once the budget is spent.
    const { RETRY_DELAYS_MS, isRetryableLoadError, nextRecoveryDelay, nextRetryDelay } = require("./recovery.cjs");
    const recoverableReasons = new Set(["crashed", "oom", "killed", "abnormal-exit"]);
    const recoveryAttempts = [];
    const LOAD_ERROR_MESSAGE = "Olantis could not be reached. Check your connection, then reload.";
    let loadRetries = 0;

    // A failed main-frame load is retried with backoff, then explained. The view
    // is revealed either way so the startup mark never sticks on a broken load.
    appView.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame) return;
      revealApp();
      logWarn("app load failed", { code, description, url });
      // -3 is ERR_ABORTED: a superseded navigation, not a failure to report.
      if (code === -3) return;
      const delayMs = isRetryableLoadError(code) ? nextRetryDelay(loadRetries) : null;
      if (delayMs === null) {
        logError("app load retries exhausted", { code, attempts: loadRetries });
        setAppError(LOAD_ERROR_MESSAGE);
        return;
      }
      loadRetries += 1;
      logInfo("app load retry scheduled", { code, attempt: loadRetries, delayMs });
      const retry = setTimeout(reloadAppView, delayMs);
      retry.unref?.();
    });

    appView.webContents.on("did-finish-load", () => {
      loadRetries = 0;
      setAppError(null);
    });

    // A dead renderer is reloaded, but only inside the recovery budget: a crash
    // loop must end in the error panel, not in an endless relaunch.
    appView.webContents.on("render-process-gone", (_event, details) => {
      logError("app renderer gone", { reason: details?.reason, exitCode: details?.exitCode });
      if (!recoverableReasons.has(details?.reason)) return;
      const delayMs = RETRY_DELAYS_MS[Math.min(recoveryAttempts.length, RETRY_DELAYS_MS.length - 1)];
      const decision = nextRecoveryDelay(recoveryAttempts, Date.now(), { delayMs });
      if (!decision.recover) {
        logError("app recovery budget exhausted", {
          attempts: recoveryAttempts.length,
          retryAfterMs: decision.delayMs,
        });
        setAppError("Olantis stopped unexpectedly and could not recover. Reload to try again.");
        return;
      }
      recoveryAttempts.push(Date.now());
      logWarn("app recovery reload scheduled", { attempt: recoveryAttempts.length, delayMs: decision.delayMs });
      const recovery = setTimeout(reloadAppView, decision.delayMs);
      recovery.unref?.();
    });

    // Never kill a slow renderer: a long task may still finish. The panel only
    // offers a reload, and clears itself if the renderer answers again.
    appView.webContents.on("unresponsive", () => {
      logWarn("app view unresponsive");
      setAppError("Olantis is taking too long to respond.");
    });
    appView.webContents.on("responsive", () => setAppError(null));

    appView.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedNavigation(url, APP_URL, appView.webContents.getURL())) {
        void appView.webContents.loadURL(url);
      } else if (isSafeExternalUrl(url)) {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });

    const handleAppNavigation = (event, url) => {
      if (isAllowedNavigation(url, APP_URL, appView.webContents.getURL())) return;
      event.preventDefault();
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
    };
    appView.webContents.on("will-navigate", handleAppNavigation);
    appView.webContents.on("will-redirect", handleAppNavigation);
    // Keep the titlebar arrows in step with the embedded app's history,
    // including client-side Next.js route changes.
    for (const eventName of ["did-navigate", "did-navigate-in-page", "did-finish-load"]) {
      appView.webContents.on(eventName, sendNavigationState);
    }
    // Cmd/Ctrl +/-/0 resize the page, not the window. The menu accelerators on
    // macOS go through the same helper (electron/menu.cjs).
    appView.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const accel = process.platform === "darwin" ? input.meta : input.control;
      if (!accel || input.alt) return;
      if (input.key === "0") {
        event.preventDefault();
        applyAppZoom("reset");
      } else if (input.key === "+" || input.key === "=") {
        event.preventDefault();
        applyAppZoom("in");
      } else if (input.key === "-" || input.key === "_") {
        event.preventDefault();
        applyAppZoom("out");
      }
    });
    // Ctrl+wheel arrives as a zoom request rather than as a key press.
    appView.webContents.on("zoom-changed", (event, direction) => {
      event.preventDefault();
      applyAppZoom(direction === "in" ? "in" : "out");
    });
    // A right click gets the platform's editing commands (and link actions) from
    // electron/context-menu.cjs instead of Chromium's default page menu.
    appView.webContents.on("context-menu", (event, params) => {
      event.preventDefault();
      const contents = appView?.webContents;
      if (!mainWindow || mainWindow.isDestroyed() || !contents || contents.isDestroyed()) return;
      const menu = Menu.buildFromTemplate(
        buildContextMenuTemplate(params, {
          inspectElement: () => contents.inspectElement(params.x, params.y),
        }),
      );
      menu.popup({ window: mainWindow });
    });
    // A reload starts with an empty renderer world, so hand it the update state
    // the shell already knows about.
    appView.webContents.on("did-finish-load", sendUpdateStatus);

    if (STARTUP_TRACE) {
      appView.webContents.on("did-start-loading", () => trace("view:did-start-loading"));
      appView.webContents.on("dom-ready", () => {
        trace("view:dom-ready");
        void tracePageMetrics("dom-ready");
      });
      appView.webContents.once("did-finish-load", () => {
        trace("view:did-finish-load");
        void tracePageMetrics("loaded");
      });
      // The first frame of a revealed page is composited a little after the
      // load event, so the paint timings only exist on a later read. This is
      // what tells the benchmark whether the reveal was in time or showed a
      // blank view for a few frames.
      appView.webContents.once("dom-ready", () => {
        const handle = setTimeout(() => void tracePageMetrics("painted"), PAINT_METRICS_DELAY_MS);
        handle.unref?.();
      });
    }

    const smokeTest = process.argv.includes("--smoke-test");
    trace("view:load-url");
    const appReady = smokeTest ? oncePromise(appView.webContents, "did-finish-load") : null;
    void entryUrl
      .then((url) => {
        trace("view:navigate", { url });
        return appView.webContents.loadURL(url);
      })
      .catch((error) => {
        // A load failure also fires did-fail-load, which reveals the error page.
        trace("view:navigate-failed", { message: error instanceof Error ? error.message : String(error) });
      });

    // Geometry comes from the last session (electron/window-state.cjs): clamped
    // to a display that is actually connected, and centred when there is no
    // usable state to restore.
    const windowState = require("./window-state.cjs");
    const windowStateFile = path.join(app.getPath("userData"), "window-state.json");
    const initialBounds = windowState.resolveInitialBounds(
      windowState.readWindowState(windowStateFile),
      require("electron").screen.getAllDisplays(),
    );
    trace("shell:window-create");
    mainWindow = new BrowserWindow({
      x: initialBounds.x,
      y: initialBounds.y,
      width: initialBounds.width,
      height: initialBounds.height,
      minWidth: windowState.MIN_WINDOW_WIDTH,
      minHeight: windowState.MIN_WINDOW_HEIGHT,
      // Created hidden and transparent, and only made opaque once the shell has
      // produced frames (see revealWindow). Windows 11 fills the client area of
      // a presented window with its own backdrop (#202020) until our first
      // composited frame lands, and `ready-to-show` alone is not enough: it
      // reports the renderer's first paint, which can arrive before the window
      // presents it. Showing at opacity 0 keeps that backdrop invisible, so the
      // first pixel the user sees is the shell's own #050507 title bar.
      show: false,
      opacity: 0,
      // macOS keeps its native traffic lights inside this same title bar row
      // (shell.css hides the custom controls there); elsewhere the frame is off
      // and shell.html draws both the title bar and the window controls.
      ...(process.platform === "darwin"
        ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 15, y: 17 } }
        : { frame: false }),
      backgroundColor: APP_BACKGROUND,
      title: "Olantis — Portfolio Dashboard",
      icon: iconPath,
      webPreferences: {
        preload: template,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    trace("shell:window-created");
    // First painted frame of the shell page — title bar plus the centred startup
    // mark, both already #050507 — so the window's first visible frame is the
    // startup state instead of an empty grey client area. A shell that fails to
    // load still reveals, so the window can never stay invisible.
    const revealWindow = () => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return;
      // A maximised last session is applied before the window is ever presented,
      // so the first frame the user sees is already the maximised window.
      if (initialBounds.maximized) mainWindow.maximize();
      // Shown while still fully transparent: Windows composites its window
      // backdrop into an invisible window, not onto the screen.
      mainWindow.show();
      trace("window:shown");
      let opaque = false;
      const showOpaque = () => {
        if (opaque) return;
        opaque = true;
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.setOpacity(1);
        trace("window:opaque");
      };
      // Three animation frames from the shell means the compositor has already
      // produced frames of the real page, so raising the opacity cannot reveal
      // anything but the shell. A renderer that never gets there still cannot
      // leave the window stuck invisible: the timeout lifts it regardless.
      const settled = mainWindow.webContents.executeJavaScript(
        "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))",
      );
      void settled.then(showOpaque, showOpaque);
      const fallback = setTimeout(showOpaque, WINDOW_OPACITY_FALLBACK_MS);
      fallback.unref?.();
    };
    const shellReady = smokeTest ? oncePromise(mainWindow.webContents, "did-finish-load") : null;

    mainWindow.contentView.addChildView(appView);
    syncAppBounds();
    mainWindow.on("resize", syncAppBounds);
    mainWindow.on("maximize", () => mainWindow.webContents.send("olantis:window:maximized", true));
    mainWindow.on("unmaximize", () => mainWindow.webContents.send("olantis:window:maximized", false));
    // Geometry is saved on a debounce, so dragging or resizing does not write the
    // disk on every pixel; closing flushes synchronously to keep the last state.
    const persistWindowState = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      windowState.writeWindowState(windowStateFile, {
        ...mainWindow.getNormalBounds(),
        maximized: mainWindow.isMaximized(),
      });
    };
    let windowStateTimer;
    const scheduleWindowStateSave = () => {
      if (windowStateTimer) clearTimeout(windowStateTimer);
      windowStateTimer = setTimeout(persistWindowState, 500);
      windowStateTimer.unref?.();
    };
    for (const eventName of ["resize", "move", "maximize", "unmaximize"]) {
      mainWindow.on(eventName, scheduleWindowStateSave);
    }
    mainWindow.on("close", () => {
      if (windowStateTimer) clearTimeout(windowStateTimer);
      windowStateTimer = undefined;
      persistWindowState();
    });
    if (STARTUP_TRACE) {
      mainWindow.webContents.once("did-finish-load", () => trace("shell:did-finish-load"));
      mainWindow.once("ready-to-show", () => trace("shell:ready-to-show"));
    }
    // Registered before loadURL so the first paint cannot be missed. The load and
    // failure events are backstops in case a paint never reports: a broken shell
    // must still produce a visible window, even if it cannot look right.
    mainWindow.once("ready-to-show", revealWindow);
    mainWindow.webContents.once("did-finish-load", revealWindow);
    mainWindow.webContents.once("did-fail-load", revealWindow);
    // A shell that fails to load still reveals, but the reason belongs in the
    // log: without it a white window on a user's machine is unexplainable.
    mainWindow.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (isMainFrame) logError("shell load failed", { code, description, url });
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      logError("shell renderer gone", { reason: details?.reason, exitCode: details?.exitCode });
    });
    mainWindow.on("closed", () => {
      mainWindow = undefined;
      appView = undefined;
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    mainWindow.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith("file:")) return;
      event.preventDefault();
    });

    const shellUrl = require("node:url").pathToFileURL(shellHtml);
    shellUrl.searchParams.set("icon", require("node:url").pathToFileURL(iconPath).href);
    // shell.js turns this into document.documentElement.dataset.platform, which
    // shell.css uses to hide the custom window controls on macOS.
    shellUrl.searchParams.set("platform", process.platform);
    void mainWindow.loadURL(shellUrl.href);

    if (smokeTest) void runSmokeTest(shellReady, appReady);
  }

  function sendUpdateStatus() {
    if (!appView || appView.webContents.isDestroyed()) return;
    appView.webContents.send("olantis:update:status", toUpdateStatusPayload(updateState));
  }

  /** Fold one updater event into the reducer, then tell the page what changed. */
  function dispatchUpdate(event) {
    updateState = reduceUpdate(updateState, event);
    sendUpdateStatus();
  }

  /**
   * Quit, apply the downloaded build and relaunch. This only runs when someone
   * clicks the sidebar's restart control: there is no timer that forces it.
   */
  function installUpdate() {
    if (updateState.status !== "downloaded" || !updaterInstance) return;
    let launched = false;
    try {
      launched = updaterInstance.quitAndInstall(true, true);
    } catch (error) {
      console.error("[updater] install failed:", error?.message ?? error);
    }
    // A false return means the installer never started, but the build is still
    // on disk, so the control offers another restart instead of stranding it.
    if (!launched) dispatchUpdate({ type: "install-failed", at: Date.now() });
  }

  function startAutoUpdates() {
    // Auto-updates are resolved by electron-updater from the published GitHub
    // release (see build.publish in package.json); skip them in dev runs.
    if (!app.isPackaged) return;

    let updater;
    try {
      trace("updater:require-start");
      ({ autoUpdater: updater } = require("electron-updater"));
      trace("updater:required");
    } catch (error) {
      console.error("[updater] electron-updater is unavailable:", error?.message ?? error);
      dispatchUpdate({ type: "disable" });
      return;
    }

    updaterInstance = updater;
    updater.logger = console;
    // Download in the background and install on the next quit. Nothing relaunches
    // the app underneath someone who is reading their portfolio.
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;

    const dispatch = (event) => dispatchUpdate({ ...event, at: Date.now() });
    updater.on("error", (error) => {
      console.error("[updater]", error?.message ?? error);
      // The reducer decides whether this was a check or a download failure.
      dispatch({ type: "check-failed" });
    });
    updater.on("checking-for-update", () => dispatch({ type: "check-start" }));
    updater.on("update-available", (info) =>
      dispatch({
        type: "update-available",
        version: info?.version ?? null,
        // The GitHub release body is what the changelog panel lists.
        releaseNotes: info?.releaseNotes ?? null,
        releaseDate: info?.releaseDate ?? null,
      }),
    );
    updater.on("update-not-available", () => dispatch({ type: "no-update" }));
    updater.on("download-progress", (progress) => dispatch({ type: "download-progress", percent: progress?.percent ?? null }));
    updater.on("update-downloaded", (info) =>
      dispatch({
        type: "download-complete",
        version: info?.version ?? null,
        releaseNotes: info?.releaseNotes ?? null,
        releaseDate: info?.releaseDate ?? null,
      }),
    );

    // Exponential backoff instead of a fixed six-hour poll: 5m, 15m, 1h, then a
    // capped 6h, with jitter. A check that completes resets the schedule, and a
    // background check is skipped while the machine is offline.
    let checkAttempt = 0;

    function scheduleNextCheck() {
      const delay = nextCheckDelayMs(checkAttempt);
      setTimeout(runScheduledCheck, delay).unref?.();
      trace("updater:next-check", { delay, attempt: checkAttempt });
    }

    function runScheduledCheck() {
      if (!require("electron").net.isOnline()) {
        trace("updater:check-skipped-offline");
        scheduleNextCheck();
        return;
      }
      checkAttempt += 1;
      void updater
        .checkForUpdates()
        .then(
          // Reaching the feed is the success the backoff resets on, whether or
          // not it found a new build.
          () => {
            checkAttempt = 0;
          },
          (error) => {
            console.error("[updater] check failed:", error?.message ?? error);
          },
        )
        .then(scheduleNextCheck);
    }

    // The first check runs immediately; everything after it is scheduled.
    void updater.checkForUpdates().catch((error) => console.error("[updater] check failed:", error?.message ?? error));
    scheduleNextCheck();
  }

  /**
   * Paint the update flow in an unpackaged shell so its changelog, progress and
   * restart states can be reviewed without publishing a release. Like the real
   * updater this is skipped in packaged builds.
   */
  function startUpdatePreview() {
    if (!UPDATE_PREVIEW_STATE) return;
    const version = "0.1.137";
    const steps = {
      available: [{ type: "update-available", version }],
      downloading: [
        { type: "update-available", version },
        { type: "download-progress", percent: 63 },
      ],
      ready: [
        { type: "update-available", version },
        { type: "download-progress", percent: 100 },
        { type: "download-complete", version },
      ],
      error: [
        { type: "update-available", version },
        { type: "check-failed" },
      ],
    }[UPDATE_PREVIEW_STATE];
    if (!steps) return;
    for (const step of steps) {
      dispatchUpdate({
        ...step,
        releaseNotes: UPDATE_PREVIEW_NOTES,
        releaseDate: new Date().toISOString(),
        at: Date.now(),
      });
    }
  }

  /**
   * Start the updater only once the app has had its first paint. Requiring
   * electron-updater pulls in ~200ms of synchronous module loading, and its
   * first check competes with the launch itself for disk and network — both
   * were landing on the critical path when this ran straight from whenReady.
   */
  function startAutoUpdatesWhenIdle() {    if (!app.isPackaged) return;

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      startAutoUpdates();
    };

    if (!appView) {
      start();
      return;
    }
    const idle = () => {
      const handle = setTimeout(start, 1500);
      handle.unref?.();
    };
    if (appView.webContents.isLoadingMainFrame()) appView.webContents.once("did-finish-load", idle);
    else idle();
    // The app page can stall (offline, sign-in); never hold the updater back
    // forever, and never let it land inside the first fifth of a second.
    const fallback = setTimeout(start, 6000);
    fallback.unref?.();
  }

  app.whenReady().then(() => {
    trace("app:ready");
    // Permissions are scoped to the app's origin, and the default is deny: the
    // sign-in chain runs in this session, so a provider page must not be able to
    // reach the camera, the microphone or the clipboard.
    const { installPermissionHandlers } = require("./permissions.cjs");
    installPermissionHandlers({ session: session.defaultSession, appUrl: APP_URL });
    // Backstop for every web contents this process creates. The app view below
    // installs its own window-open handler, which is the one that decides where
    // Olantis links go; this only keeps anything else from opening a window or
    // embedding a <webview>.
    app.on("web-contents-created", (_event, contents) => {
      contents.on("will-attach-webview", (event) => event.preventDefault());
      contents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) void shell.openExternal(url);
        return { action: "deny" };
      });
    });
    startFileLogging();
    logInfo("session started", { version: app.getVersion(), url: APP_URL, packaged: app.isPackaged });
    // The shell and the app are dark-only, so native chrome (menus, scrollbars,
    // form controls) must not follow a light OS theme.
    require("electron").nativeTheme.themeSource = "dark";
    // Windows and Linux draw their own title bar and window controls, so they
    // keep no application menu; macOS keeps its native menu bar.
    const { buildMenuTemplate } = require("./menu.cjs");
    const platformMenu = buildMenuTemplate({
      platform: process.platform,
      isPackaged: app.isPackaged,
      actions: { zoom: applyAppZoom },
    });
    Menu.setApplicationMenu(platformMenu ? Menu.buildFromTemplate(platformMenu) : null);
    installWindowControls();
    trace("app:window-installed");
    startUpdatePreview();
    startAutoUpdatesWhenIdle();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) installWindowControls();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
