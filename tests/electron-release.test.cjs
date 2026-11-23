/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

const rootPackage = readJson("package.json");
const desktopPackage = readJson(path.join("electron", "package.json"));
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "electron-release.yml"), "utf8");

test("Windows installer keeps a name that survives GitHub releases", () => {
  const artifactName = rootPackage.build?.win?.artifactName;

  assert.equal(artifactName, "${productName}.Setup.${version}.${ext}");
  // GitHub rewrites spaces in uploaded asset names, which breaks the download
  // link the release page offers.
  assert.doesNotMatch(artifactName, /\s/);
  assert.doesNotMatch(artifactName, /Setup /);
});

test("the release workflow uploads the installers it builds", () => {
  assert.match(workflow, /gh release upload "\$TAG"/);
  assert.match(workflow, /release\/\*\.exe/);
  assert.match(workflow, /release\/\*\.dmg/);
  assert.match(workflow, /release\/\*\.AppImage/);
});

test("desktop version is stamped from the release run number", () => {
  assert.match(workflow, /npm pkg set "version=\$version"/);
  assert.match(workflow, /npm --prefix electron pkg set "version=\$version"/);
  assert.match(workflow, /version="0\.1\.\$\{\{ github\.run_number \}\}"/);
});

test("the builder resolves the electron version from the electron workspace", () => {
  const runner = fs.readFileSync(path.join(root, "scripts", "run-electron-builder.mjs"), "utf8");

  // electron-builder only scans <projectDir>/node_modules, which stopped holding
  // the desktop toolchain, and Electron 45 no longer installs a binary whose
  // dist/version it could read. Without the explicit version it aborts with
  // "Cannot compute electron version from installed node modules".
  assert.match(runner, /electron\/package\.json/);
  assert.match(runner, /--config\.electronVersion=/);
});

test("desktop release is skipped unless desktop files changed", () => {
  const trigger = workflow.slice(0, workflow.indexOf("permissions:"));

  assert.match(trigger, /paths:/, "the release must be path-filtered instead of rebuilding on every push");
  assert.match(trigger, /- "electron\/\*\*"/);
  assert.match(trigger, /- "scripts\/run-electron-builder\.mjs"/, "builder changes must rebuild the installers");
  assert.match(trigger, /- "public\/brand\/\*\*"/);
  assert.doesNotMatch(trigger, /- "src\/\*\*"/, "web-only changes ship through Vercel, not a new installer");
  assert.match(trigger, /workflow_dispatch:/, "a skipped release still needs a manual way to rebuild");
});

test("the desktop shell does not package a self-updater", () => {
  assert.equal(desktopPackage.dependencies?.["electron-updater"], undefined, "the shell never downloads or installs an update");
  assert.equal(rootPackage.build.publish, undefined, "nothing publishes an update feed the shell would install from");
  assert.equal(rootPackage.build.beforeBuild, undefined, "electron-builder has to install the desktop dependencies itself");
});
