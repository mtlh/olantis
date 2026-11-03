/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("olantisDesktop", {
  minimize: () => ipcRenderer.send("olantis:window:minimize"),
  toggleMaximize: () => ipcRenderer.send("olantis:window:toggle-maximize"),
  close: () => ipcRenderer.send("olantis:window:close"),
  isMaximized: () => ipcRenderer.invoke("olantis:window:is-maximized"),
  goBack: () => ipcRenderer.send("olantis:nav:back"),
  goForward: () => ipcRenderer.send("olantis:nav:forward"),
  navState: () => ipcRenderer.invoke("olantis:nav:state"),
  onNavStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("olantis:nav:state", listener);
    return () => ipcRenderer.removeListener("olantis:nav:state", listener);
  },
  onMaximizedChange: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on("olantis:window:maximized", listener);
    return () => ipcRenderer.removeListener("olantis:window:maximized", listener);
  },
});
