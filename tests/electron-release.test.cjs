/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
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

test("the packaged shell ships the electron-updater dependency", () => {
  assert.ok(desktopPackage.dependencies?.["electron-updater"], "electron-updater must be a desktop dependency to be packaged");
  assert.equal(rootPackage.build.beforeBuild, undefined, "electron-builder has to install the desktop dependencies itself");
});

// --- Update state machine ---------------------------------------------------

const { createUpdateState, nextCheckDelayMs, reduceUpdate, toUpdateStatusPayload } = require("../electron/update-machine.cjs");

const AT = 1_700_000_000_000;

const downloadedState = () =>
  reduceUpdate(
    reduceUpdate(createUpdateState({ currentVersion: "0.1.4" }), { type: "update-available", version: "0.1.5" }),
    { type: "download-complete", version: "0.1.5" },
  );

test("a check moves the updater to checking and clears a previous error", () => {
  const failed = reduceUpdate(
    reduceUpdate(createUpdateState(), { type: "check-start", at: AT }),
    { type: "check-failed", at: AT },
  );
  const state = reduceUpdate(failed, { type: "check-start", at: AT });

  assert.equal(state.status, "checking");
  assert.equal(state.percent, null);
  assert.equal(state.errorContext, null);
  assert.equal(state.canRetry, false);
});

test("a failed check keeps a downloaded build instead of throwing it away", () => {
  const state = reduceUpdate(downloadedState(), { type: "check-failed", at: AT });

  assert.equal(state.status, "downloaded");
  assert.equal(state.downloadedVersion, "0.1.5");
  assert.equal(state.percent, null);
  // The build is on disk and installs on quit, so nothing needs retrying.
  assert.equal(state.canRetry, false);
});

test("a failed check without a download is retryable", () => {
  const checking = reduceUpdate(createUpdateState(), { type: "check-start", at: AT });
  const state = reduceUpdate(checking, { type: "check-failed", at: AT });

  assert.equal(state.status, "error");
  assert.equal(state.errorContext, "check");
  assert.equal(state.canRetry, true);
  assert.equal(state.checkedAt, AT);
});

test("an available update is offered before its download starts", () => {
  const state = reduceUpdate(createUpdateState({ currentVersion: "0.1.4" }), { type: "update-available", version: "0.1.5", at: AT });

  assert.equal(state.status, "available");
  assert.equal(state.availableVersion, "0.1.5");
  assert.equal(state.downloadedVersion, null);
  assert.equal(state.percent, null);
  assert.equal(state.checkedAt, AT);
});

test("download progress only exists while a download is in flight", () => {
  const available = reduceUpdate(createUpdateState(), { type: "update-available", version: "0.1.5" });
  const downloading = reduceUpdate(available, { type: "download-progress", percent: 42.25 });

  assert.equal(downloading.status, "downloading");
  assert.equal(downloading.percent, 42.3);
  assert.equal(reduceUpdate(downloading, { type: "download-progress", percent: 140 }).percent, 100);

  // A finished build must not be dragged back into a progress state.
  const downloaded = reduceUpdate(downloadedState(), { type: "download-progress", percent: 50 });
  assert.equal(downloaded.status, "downloaded");
  assert.equal(downloaded.percent, null);
});

test("a completed download is ready for the explicit restart", () => {
  const state = downloadedState();
  const payload = toUpdateStatusPayload(state);

  assert.equal(state.status, "downloaded");
  assert.equal(state.downloadedVersion, "0.1.5");
  assert.equal(state.percent, null);
  // The page already speaks "ready"; keep that contract.
  assert.equal(payload.state, "ready");
  assert.equal(payload.version, "0.1.5");
  assert.equal(payload.enabled, true);
  assert.equal(payload.percent, null);
  assert.equal(payload.errorContext, null);
});

test("a no-update answer cannot discard a downloaded build", () => {
  const state = reduceUpdate(downloadedState(), { type: "no-update", at: AT });

  assert.equal(state.status, "downloaded");
  assert.equal(state.downloadedVersion, "0.1.5");
  assert.equal(state.canRetry, false);
  assert.equal(state.checkedAt, AT);
});

test("a no-update answer without a download settles on up-to-date", () => {
  const state = reduceUpdate(createUpdateState({ currentVersion: "0.1.5" }), { type: "no-update", at: AT });

  assert.equal(state.status, "up-to-date");
  assert.equal(state.percent, null);
  assert.equal(state.canRetry, false);
});

test("a failed install keeps the build and offers another restart", () => {
  const state = reduceUpdate(downloadedState(), { type: "install-failed", at: AT });

  assert.equal(state.status, "error");
  assert.equal(state.errorContext, "install");
  assert.equal(state.canRetry, true);
  assert.equal(state.downloadedVersion, "0.1.5");
});

test("disabling the updater retires retry and progress state", () => {
  const state = reduceUpdate(createUpdateState(), { type: "disable" });

  assert.equal(state.enabled, false);
  assert.equal(state.status, "disabled");
  assert.equal(state.canRetry, false);
  assert.equal(state.percent, null);
});

// --- Update changelog -------------------------------------------------------

const changelog = `## What's Changed
* feat: show the changelog before relaunching by @mtlh in https://github.com/mtlh/olantis/pull/131
* fix: keep sidebar selections instant by @mtlh in https://github.com/mtlh/olantis/pull/129

**Full Changelog**: https://github.com/mtlh/olantis/compare/desktop-1...desktop-2`;

const offeredWithChangelog = () =>
  reduceUpdate(createUpdateState({ currentVersion: "0.1.4" }), {
    type: "update-available",
    version: "0.1.5",
    releaseNotes: changelog,
    releaseDate: "2026-11-22T09:00:00.000Z",
    at: AT,
  });

test("an offered update carries its changelog into the status payload", () => {
  const payload = toUpdateStatusPayload(offeredWithChangelog());

  assert.deepEqual(payload.notes, [
    "feat: show the changelog before relaunching",
    "fix: keep sidebar selections instant",
  ]);
  assert.equal(payload.releaseUrl, "https://github.com/mtlh/olantis/releases/latest");
  assert.equal(payload.releasedAt, "2026-11-22T09:00:00.000Z");
});

test("a completed download keeps the notes from the offer", () => {
  const downloaded = reduceUpdate(offeredWithChangelog(), { type: "download-complete", version: "0.1.5" });

  assert.equal(downloaded.status, "downloaded");
  assert.equal(downloaded.releaseNotes.length, 2);
  assert.equal(toUpdateStatusPayload(downloaded).state, "ready");
});

test("a download can supply notes the offer did not carry", () => {
  const available = reduceUpdate(createUpdateState(), { type: "update-available", version: "0.1.5" });
  const downloaded = reduceUpdate(available, {
    type: "download-complete",
    version: "0.1.5",
    releaseNotes: "* fix: one more thing by @mtlh in https://example.test/1",
  });

  assert.deepEqual(downloaded.releaseNotes, ["fix: one more thing"]);
});

test("a no-update answer clears the changelog", () => {
  const state = reduceUpdate(offeredWithChangelog(), { type: "no-update", at: AT });
  const payload = toUpdateStatusPayload(state);

  assert.deepEqual(state.releaseNotes, []);
  assert.equal(payload.releaseUrl, null);
  assert.equal(payload.releasedAt, null);
});

test("a failed check keeps the changelog available for the retry", () => {
  const state = reduceUpdate(offeredWithChangelog(), { type: "check-failed", at: AT });

  assert.equal(state.status, "error");
  assert.equal(state.releaseNotes.length, 2);
});

test("background checks back off exponentially and cap at six hours", () => {
  const steady = () => 0.5;

  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((attempt) => nextCheckDelayMs(attempt, steady)),
    [300_000, 900_000, 3_600_000, 21_600_000, 21_600_000, 21_600_000],
  );

  // Jitter stays inside the ±15% band instead of drifting the schedule.
  assert.equal(nextCheckDelayMs(0, () => 0), 255_000);
  const upper = nextCheckDelayMs(0, () => 0.999);
  assert.ok(upper > 300_000 && upper <= 345_000);
});

// --- Update manifest --------------------------------------------------------

const manifestScript = pathToFileURL(path.join(root, "scripts", "verify-electron-update-manifest.mjs")).href;

test("the manifest check fails when a Windows installer has no latest.yml", async () => {
  const { validateManifest } = await import(manifestScript);

  assert.throws(
    () => validateManifest({ manifest: null, manifestFile: "release/latest.yml", desktopVersion: "0.1.5", windowsInstaller: "Olantis.Setup.0.1.5.exe" }),
    /electron-updater would 404/,
  );
  // Another platform's build without a manifest is still allowed to skip.
  assert.equal(validateManifest({ manifest: null, manifestFile: "release/latest.yml", desktopVersion: "0.1.5", windowsInstaller: null }), null);
});

test("the manifest check keeps rejecting unusable installer names", async () => {
  const { validateManifest } = await import(manifestScript);
  const base = { manifestFile: "release/latest.yml", desktopVersion: "0.1.5", windowsInstaller: "Olantis.Setup.0.1.5.exe" };
  const yml = (fields) => Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n");

  assert.throws(() => validateManifest({ ...base, manifest: yml({ version: "0.1.5" }) }), /does not name an installer/);
  assert.throws(
    () => validateManifest({ ...base, manifest: yml({ version: "0.1.5", path: "Olantis Setup 0.1.5.exe" }) }),
    /contains spaces/,
  );
  assert.throws(
    () => validateManifest({ ...base, manifest: yml({ version: "0.1.4", path: "Olantis.Setup.0.1.5.exe" }) }),
    /does not match/,
  );
  assert.deepEqual(validateManifest({ ...base, manifest: yml({ version: "0.1.5", path: "Olantis.Setup.0.1.5.exe" }) }), {
    installerName: "Olantis.Setup.0.1.5.exe",
    manifestVersion: "0.1.5",
  });
});

