/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { app, BrowserWindow, Menu, WebContentsView, ipcMain, shell } = require("electron");
const { isAllowedNavigation, isExternalWebUrl } = require("./url-policy.cjs");

const DEFAULT_APP_URL = "https://olantis.vercel.app";
const APP_URL = process.env.OLANTIS_ELECTRON_URL || DEFAULT_APP_URL;
const TITLEBAR_HEIGHT = 46;
const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, "brand-mark.png")
  : path.join(__dirname, "..", "public", "brand", "mark-512.png");

app.setName("Olantis");
app.setAppUserModelId("com.olantis.desktop");

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

  function shellWindowFor(event) {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window === mainWindow ? window : null;
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
  ipcMain.on("olantis:page:back", (event) => {
    if (shellWindowFor(event) && appView?.webContents.canGoBack()) appView.webContents.goBack();
  });
  ipcMain.on("olantis:page:reload", (event) => {
    if (shellWindowFor(event)) appView?.webContents.reload();
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

    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 900,
      minHeight: 620,
      show: false,
      frame: false,
      backgroundColor: "#050507",
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

    appView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    mainWindow.contentView.addChildView(appView);
    syncAppBounds();
    mainWindow.on("resize", syncAppBounds);
    mainWindow.on("maximize", () => mainWindow.webContents.send("olantis:window:maximized", true));
    mainWindow.on("unmaximize", () => mainWindow.webContents.send("olantis:window:maximized", false));
    mainWindow.once("ready-to-show", () => mainWindow.show());
    mainWindow.on("closed", () => {
      mainWindow = undefined;
      appView = undefined;
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    mainWindow.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith("file:")) return;
      event.preventDefault();
    });

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

    if (process.argv.includes("--smoke-test")) {
      const shellLoaded = new Promise((resolve) => mainWindow.webContents.once("did-finish-load", resolve));
      appView.webContents.once("did-finish-load", async () => {
        try {
          await shellLoaded;
          const integratedToolbar = await mainWindow.webContents.executeJavaScript(
            '["back-button", "reload-button", "minimize-button", "maximize-button", "close-button"].every((id) => document.getElementById(id))',
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
      });
    }

    const shellUrl = require("node:url").pathToFileURL(shellHtml);
    shellUrl.searchParams.set("icon", require("node:url").pathToFileURL(iconPath).href);
    void mainWindow.loadURL(shellUrl.href);
    void appView.webContents.loadURL(APP_URL);
  }

  app.whenReady().then(() => {
    // The integrated toolbar replaces the platform menu/title bar.
    Menu.setApplicationMenu(null);
    installWindowControls();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) installWindowControls();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
