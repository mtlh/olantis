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
  // GitHub rewrites spaces in uploaded asset names, which desynchronises the
  // installer from the `path` entry electron-updater reads in latest.yml.
  assert.doesNotMatch(artifactName, /\s/);
  assert.doesNotMatch(artifactName, /Setup /);
});

test("desktop publishes to the Olantis GitHub releases", () => {
  const [target] = rootPackage.build.publish;

  assert.equal(target.provider, "github");
  assert.equal(target.owner, "mtlh");
  assert.equal(target.repo, "olantis");
});

test("desktop version is stamped from the release run number", () => {
  assert.match(workflow, /npm pkg set "version=\$version"/);
  assert.match(workflow, /npm --prefix electron pkg set "version=\$version"/);
  assert.match(workflow, /version="0\.1\.\$\{\{ github\.run_number \}\}"/);
});

test("desktop release is skipped unless desktop files changed", () => {
  const trigger = workflow.slice(0, workflow.indexOf("permissions:"));

  assert.match(trigger, /paths:/, "the release must be path-filtered instead of rebuilding on every push");
  assert.match(trigger, /- "electron\/\*\*"/);
  assert.match(trigger, /- "public\/brand\/\*\*"/);
  assert.doesNotMatch(trigger, /- "src\/\*\*"/, "web-only changes ship through Vercel, not a new installer");
  assert.match(trigger, /workflow_dispatch:/, "a skipped release still needs a manual way to rebuild");
});

test("the packaged shell ships the electron-updater dependency", () => {
  assert.ok(desktopPackage.dependencies?.["electron-updater"], "electron-updater must be a desktop dependency to be packaged");
  assert.equal(rootPackage.build.beforeBuild, undefined, "electron-builder has to install the desktop dependencies itself");
});
