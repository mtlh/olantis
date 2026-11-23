/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

// Bridges the recent-changes feed into the embedded web app. The desktop shell
// is a window onto the deployed site, so the sidebar offers a manual changelog
// read — never an update download or a restart.
contextBridge.exposeInMainWorld("olantisDesktop", {
  recentChanges: () => ipcRenderer.invoke("olantis:changes:check"),
});
