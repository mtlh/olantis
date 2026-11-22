/* eslint-disable @typescript-eslint/no-require-imports */
const { app, shell } = require("electron");

const REPO_URL = "https://github.com/mtlh/olantis";

/**
 * The native menu bar is a macOS-only surface: Windows and Linux draw their own
 * title bar and window controls (shell.html), so main.cjs keeps their
 * application menu null. This returns null for those platforms.
 *
 * `actions.zoom("in" | "out" | "reset")` zooms the embedded app; it is wired to
 * the same helper as the Cmd/Ctrl +/-/0 shortcuts, never to a menu zoom role,
 * because the shell page must stay at 1x.
 */
function buildMenuTemplate({ platform, isPackaged, actions }) {
  if (platform !== "darwin") return null;

  const zoom = (direction) => () => actions.zoom(direction);
  const viewItems = [
    // Reloading and especially devtools are development-only; a shipped build
    // should not offer a way to detach from the page.
    ...(isPackaged ? [] : [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }]),
    { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: zoom("reset") },
    { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", click: zoom("in") },
    { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: zoom("out") },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];

  return [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    { label: "View", submenu: viewItems },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Olantis on GitHub",
          click: () => void shell.openExternal(REPO_URL),
        },
      ],
    },
  ];
}

module.exports = { buildMenuTemplate, REPO_URL };
