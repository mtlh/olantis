/* eslint-disable @typescript-eslint/no-require-imports */
const { app, clipboard, shell } = require("electron");
const { isExternalWebUrl } = require("./url-policy.cjs");

/**
 * The template for a right click inside the embedded app. Electron hands the
 * main process the click's own `params`, so the edit commands only enable
 * themselves when the click landed in an editable field or on a selection, and
 * link actions only appear for a URL that is safe to open.
 *
 * `actions.inspectElement` opens devtools on the clicked node; it is only
 * offered while the app is unpackaged.
 */
function buildContextMenuTemplate(params, { inspectElement } = {}) {
  const flags = params.editFlags ?? {};
  const template = [
    { role: "cut", enabled: Boolean(flags.canCut) },
    { role: "copy", enabled: Boolean(flags.canCopy) },
    { role: "paste", enabled: Boolean(flags.canPaste) },
    { role: "selectAll", enabled: Boolean(flags.canSelectAll) },
  ];

  const linkUrl = typeof params.linkURL === "string" ? params.linkURL : "";
  if (isExternalWebUrl(linkUrl)) {
    template.push(
      { type: "separator" },
      {
        label: "Copy Link",
        click: () => clipboard.writeText(linkUrl),
      },
      {
        label: "Open Link in Browser",
        click: () => void shell.openExternal(linkUrl),
      },
    );
  }

  if (!app.isPackaged && inspectElement) {
    template.push(
      { type: "separator" },
      {
        label: "Inspect Element",
        click: () => inspectElement(params.x, params.y),
      },
    );
  }

  return template;
}

module.exports = { buildContextMenuTemplate };
