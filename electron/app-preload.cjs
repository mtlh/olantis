/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

// Bridges the updater state that the desktop shell owns into the embedded web
// app. Updates are surfaced in the sidebar's update control instead of in a
// blocking native dialog, so the page needs to know when one is ready.
contextBridge.exposeInMainWorld("olantisDesktop", {
  updateStatus: () => ipcRenderer.invoke("olantis:update:status"),
  checkForUpdates: () => ipcRenderer.invoke("olantis:update:check"),
  restartToUpdate: () => ipcRenderer.send("olantis:update:restart"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("olantis:update:status", listener);
    return () => ipcRenderer.removeListener("olantis:update:status", listener);
  },
});
