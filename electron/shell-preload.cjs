/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("olantisDesktop", {
  minimize: () => ipcRenderer.send("olantis:window:minimize"),
  toggleMaximize: () => ipcRenderer.send("olantis:window:toggle-maximize"),
  close: () => ipcRenderer.send("olantis:window:close"),
  isMaximized: () => ipcRenderer.invoke("olantis:window:is-maximized"),
  onMaximizedChange: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on("olantis:window:maximized", listener);
    return () => ipcRenderer.removeListener("olantis:window:maximized", listener);
  },
});
