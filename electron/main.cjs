/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { app, BrowserWindow, Menu, WebContentsView, dialog, ipcMain, shell } = require("electron");
const { isAllowedNavigation, isExternalWebUrl } = require("./url-policy.cjs");

const DEFAULT_APP_URL = "https://olantis.vercel.app";
const APP_URL = process.env.OLANTIS_ELECTRON_URL || DEFAULT_APP_URL;
const TITLEBAR_HEIGHT = 46;
// Matches the app's own background (globals.css) so no white frame can show
// through while the remote page loads.
const APP_BACKGROUND = "#050507";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, "brand-mark.png")
  : path.join(__dirname, "..", "public", "brand", "mark-512.png");

// Startup tracing: opt-in via OLANTIS_STARTUP_TRACE=1. Every mark is emitted as
// one JSON line prefixed with OLANTIS-TRACE so scripts/electron-startup-bench.mjs
// (and anyone with a terminal) can see exactly where launch time goes. The
// helper is a no-op otherwise, so the shipped app pays nothing for it.
const STARTUP_TRACE_LEVEL = Number(process.env.OLANTIS_STARTUP_TRACE || 0);
// 1 = main-process + page milestones, 2 = also Chromium's paint lifecycle.
const STARTUP_TRACE = STARTUP_TRACE_LEVEL > 0;
const STARTUP_TRACE_PAINT = STARTUP_TRACE_LEVEL > 1;
const STARTUP_TRACE_FILE = process.env.OLANTIS_STARTUP_TRACE_FILE || "";
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

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  function oncePromise(emitter, event) {
    return new Promise((resolve) => emitter.once(event, resolve));
  }

  async function runSmokeTest(shellReady, appReady) {
    try {
      await Promise.all([shellReady, appReady]);
      const integratedToolbar = await mainWindow.webContents.executeJavaScript(
        '["back-button", "forward-button", "minimize-button", "maximize-button", "close-button"].every((id) => document.getElementById(id))',
      );
      const renderedApp = await appView.webContents.executeJavaScript(
        'document.readyState === "complete" && document.body.innerText.trim().length > 0',
      );
      const toolbarIsIntegrated = appView.getBounds().y === TITLEBAR_HEIGHT;
      const brandIconLoaded = await mainWindow.webContents.executeJavaScript(
        '(() => { const img = document.getElementById("brand-icon"); return Boolean(img && img.complete && img.naturalWidth > 0); })()',
      );
      if (!integratedToolbar || !toolbarIsIntegrated) {
        console.error("Electron smoke test: integrated desktop toolbar was not rendered above the app.");
      }
      if (!renderedApp) console.error("Electron smoke test: Olantis content was not rendered.");
      if (!brandIconLoaded) console.error("Electron smoke test: the Olantis brand icon did not load in the title bar.");
      app.exit(renderedApp && integratedToolbar && toolbarIsIntegrated && brandIconLoaded ? 0 : 1);
    } catch (error) {
      console.error("Electron smoke test failed:", error);
      app.exit(1);
    }
  }

  function shellWindowFor(event) {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window === mainWindow ? window : null;
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

  ipcMain.on("olantis:window:minimize", (event) => shellWindowFor(event)?.minimize());
  ipcMain.on("olantis:window:toggle-maximize", (event) => {
    const window = shellWindowFor(event);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.on("olantis:window:close", (event) => shellWindowFor(event)?.close());
  ipcMain.handle("olantis:window:is-maximized", (event) => Boolean(shellWindowFor(event)?.isMaximized()));

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
  ipcMain.handle("olantis:nav:state", (event) => {
    if (!shellWindowFor(event)) return { canGoBack: false, canGoForward: false };
    const history = navigationHistory();
    return { canGoBack: Boolean(history?.canGoBack()), canGoForward: Boolean(history?.canGoForward()) };
  });

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

    // The embedded app is the slow half of a launch, so its view is created and
    // pointed at the app before the shell window exists. The request, the
    // renderer process and the network stack all get going while the window
    // itself is still being constructed.
    trace("view:create");
    appView = new WebContentsView({
      webPreferences: {
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
    trace("view:created");

    appView.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedNavigation(url, APP_URL, appView.webContents.getURL())) {
        void appView.webContents.loadURL(url);
      } else if (isExternalWebUrl(url)) {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });

    const handleAppNavigation = (event, url) => {
      if (isAllowedNavigation(url, APP_URL, appView.webContents.getURL())) return;
      event.preventDefault();
      if (isExternalWebUrl(url)) void shell.openExternal(url);
    };
    appView.webContents.on("will-navigate", handleAppNavigation);
    appView.webContents.on("will-redirect", handleAppNavigation);
    // Keep the titlebar arrows in step with the embedded app's history,
    // including client-side Next.js route changes.
    for (const eventName of ["did-navigate", "did-navigate-in-page", "did-finish-load"]) {
      appView.webContents.on(eventName, sendNavigationState);
    }

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
    }

    let paintReady = Promise.resolve();
    if (STARTUP_TRACE_PAINT) {
      // Chromium's own paint milestones. Attaching the debugger costs a little,
      // so the default trace level leaves it off and the paint pass runs it
      // against both builds being compared. The navigation waits for the
      // lifecycle events to be enabled, otherwise the very first paint can slip
      // through before Chromium starts reporting it.
      try {
        appView.webContents.debugger.attach("1.3");
        appView.webContents.debugger.on("message", (_event, method, params) => {
          if (method === "Page.lifecycleEvent") trace(`paint:${params.name}`);
        });
        paintReady = appView.webContents.debugger
          .sendCommand("Page.enable")
          .then(() => appView.webContents.debugger.sendCommand("Page.setLifecycleEventsEnabled", { enabled: true }))
          .catch((error) => trace("paint:enable-failed", { message: error instanceof Error ? error.message : String(error) }));
      } catch (error) {
        trace("paint:attach-failed", { message: error instanceof Error ? error.message : String(error) });
      }
    }

    const smokeTest = process.argv.includes("--smoke-test");
    trace("view:load-url");
    const appReady = smokeTest ? oncePromise(appView.webContents, "did-finish-load") : null;
    void paintReady.then(() => appView.webContents.loadURL(APP_URL));

    trace("shell:window-create");
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 900,
      minHeight: 620,
      // Shown from the first frame. Waiting for "ready-to-show" held the window
      // back by 100-250ms after the shell had already loaded, and the shell,
      // the window and the view all paint #050507, so there is no white flash
      // to hide from.
      show: true,
      frame: false,
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
    trace("window:shown");
    const shellReady = smokeTest ? oncePromise(mainWindow.webContents, "did-finish-load") : null;

    mainWindow.contentView.addChildView(appView);
    syncAppBounds();
    mainWindow.on("resize", syncAppBounds);
    mainWindow.on("maximize", () => mainWindow.webContents.send("olantis:window:maximized", true));
    mainWindow.on("unmaximize", () => mainWindow.webContents.send("olantis:window:maximized", false));
    if (STARTUP_TRACE) {
      mainWindow.webContents.once("did-finish-load", () => trace("shell:did-finish-load"));
      mainWindow.once("ready-to-show", () => trace("shell:ready-to-show"));
    }
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
    void mainWindow.loadURL(shellUrl.href);

    if (smokeTest) void runSmokeTest(shellReady, appReady);
  }

  function promptToRestart(version) {
    const options = {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: "Update ready",
      message: `Olantis ${version} is ready to install.`,
      detail: "Restart the app to finish updating. Choosing Later installs the update the next time you quit.",
    };
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
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
      return;
    }

    updater.logger = console;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on("error", (error) => console.error("[updater]", error?.message ?? error));
    updater.on("update-downloaded", async (info) => {
      try {
        const { response } = await promptToRestart(info?.version ?? "a new version");
        if (response === 0) updater.quitAndInstall(true, true);
      } catch (error) {
        console.error("[updater] restart prompt failed:", error?.message ?? error);
      }
    });

    const check = () => {
      updater.checkForUpdates().catch((error) => console.error("[updater] check failed:", error?.message ?? error));
    };
    check();
    setInterval(check, UPDATE_CHECK_INTERVAL_MS).unref();
  }

  /**
   * Start the updater only once the app has had its first paint. Requiring
   * electron-updater pulls in ~200ms of synchronous module loading, and its
   * first check competes with the launch itself for disk and network — both
   * were landing on the critical path when this ran straight from whenReady.
   */
  function startAutoUpdatesWhenIdle() {
    if (!app.isPackaged) return;

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
    // The integrated toolbar replaces the platform menu/title bar.
    Menu.setApplicationMenu(null);
    installWindowControls();
    trace("app:window-installed");
    startAutoUpdatesWhenIdle();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) installWindowControls();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
