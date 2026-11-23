/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  MAX_FEED_RELEASES,
  desktopUpdate,
  latestDesktopRelease,
  normalizeReleaseFeed,
  packagedPathsChanged,
  platformInstaller,
  tagBuildNumber,
  versionBuildNumber,
} = require("../electron/release-feed.cjs");

const release = (overrides) => ({
  tag_name: "desktop-137-abc",
  name: "Olantis Desktop 137",
  draft: false,
  published_at: "2026-11-23T13:08:32Z",
  html_url: "https://github.com/mtlh/olantis/releases/tag/desktop-137-abc",
  assets: [
    { name: "Olantis.Setup.0.1.137.exe", browser_download_url: "https://example.test/win.exe" },
    { name: "Olantis-0.1.137.dmg", browser_download_url: "https://example.test/mac.dmg" },
    { name: "Olantis-0.1.137.AppImage", browser_download_url: "https://example.test/linux.AppImage" },
  ],
  body: "## What's Changed\n* feat: show recent changes by @mtlh in https://github.com/mtlh/olantis/pull/142\n* fix: never restart for an update by @mtlh in https://github.com/mtlh/olantis/pull/141\n\n**Full Changelog**: https://github.com/mtlh/olantis/compare/a...b",
  ...overrides,
});

test("recent changes keep the release timestamp, link and notes", () => {
  const [entry] = normalizeReleaseFeed([release()]);

  assert.equal(entry.version, "desktop-137-abc");
  assert.equal(entry.title, "Olantis Desktop 137");
  assert.equal(entry.publishedAt, "2026-11-23T13:08:32Z");
  assert.equal(entry.url, "https://github.com/mtlh/olantis/releases/tag/desktop-137-abc");
  assert.deepEqual(entry.notes, ["feat: show recent changes", "fix: never restart for an update"]);
  assert.equal(entry.assets[0].url, "https://example.test/win.exe");
});

test("drafts and unusable entries never reach the sidebar", () => {
  const feed = normalizeReleaseFeed([
    release({ draft: true }),
    release({ tag_name: "", name: "", body: "" }),
    release({ tag_name: "desktop-136-def", name: "Olantis Desktop 136" }),
  ]);

  assert.equal(feed.length, 1);
  assert.equal(feed[0].version, "desktop-136-def");
});

test("a release without notes still keeps its timestamp and link", () => {
  const [entry] = normalizeReleaseFeed([release({ body: "" })]);

  assert.deepEqual(entry.notes, []);
  assert.equal(entry.publishedAt, "2026-11-23T13:08:32Z");
  assert.equal(entry.url, "https://github.com/mtlh/olantis/releases/tag/desktop-137-abc");
});

test("the feed is capped so the popover stays readable", () => {
  const payload = Array.from({ length: MAX_FEED_RELEASES + 4 }, (_, index) =>
    release({ tag_name: `desktop-${130 + index}`, published_at: `2026-11-${10 + index}T09:00:00Z` }),
  );

  assert.equal(normalizeReleaseFeed(payload).length, MAX_FEED_RELEASES);
  assert.equal(normalizeReleaseFeed(payload, 2).length, 2);
  assert.deepEqual(normalizeReleaseFeed(null), [], "a malformed payload is not a feed");
});

test("desktop build numbers come from the app version and the release tag", () => {
  assert.equal(versionBuildNumber("0.1.138"), 138);
  assert.equal(versionBuildNumber("0.1.0"), 0);
  assert.equal(versionBuildNumber("1.2.3"), null);
  assert.equal(versionBuildNumber(null), null);

  assert.equal(tagBuildNumber("desktop-138-abcdef"), 138);
  assert.equal(tagBuildNumber("v1.0.0"), null);
});

test("a newer shell build offers its platform installer", () => {
  const feed = normalizeReleaseFeed([
    release({ tag_name: "desktop-138-new", name: "Olantis Desktop 138", assets: [
      { name: "Olantis.Setup.0.1.138.exe", browser_download_url: "https://example.test/win-138.exe" },
      { name: "Olantis-0.1.138.dmg", browser_download_url: "https://example.test/mac-138.dmg" },
      { name: "Olantis-0.1.138.AppImage", browser_download_url: "https://example.test/linux-138.AppImage" },
    ] }),
    release(),
  ]);

  const update = desktopUpdate({ currentVersion: "0.1.137", releases: feed, platform: "win32", desktopChanged: true });

  assert.equal(update.appVersion, "0.1.138");
  assert.equal(update.version, "desktop-138-new");
  assert.equal(update.downloadUrl, "https://example.test/win-138.exe");
  assert.equal(update.installerName, "Olantis.Setup.0.1.138.exe");
  assert.equal(latestDesktopRelease(feed).build, 138);
});

test("no download button for a current build or a web-only release", () => {
  const feed = normalizeReleaseFeed([release({ tag_name: "desktop-138-new", assets: [] })]);

  assert.equal(desktopUpdate({ currentVersion: "0.1.138", releases: feed, platform: "win32", desktopChanged: true }), null);
  assert.equal(desktopUpdate({ currentVersion: "0.1.137", releases: feed, platform: "win32", desktopChanged: false }), null);
  // An old or unversioned app cannot tell what it runs, so it gets no offer.
  assert.equal(desktopUpdate({ currentVersion: "dev", releases: feed, platform: "win32", desktopChanged: true }), null);
});

test("installer choice follows the platform", () => {
  const [entry] = normalizeReleaseFeed([release()]);

  assert.equal(platformInstaller(entry.assets, "win32").name, "Olantis.Setup.0.1.137.exe");
  assert.equal(platformInstaller(entry.assets, "darwin").name, "Olantis-0.1.137.dmg");
  assert.equal(platformInstaller(entry.assets, "linux").name, "Olantis-0.1.137.AppImage");
  assert.equal(platformInstaller(entry.assets, "freebsd"), null);
});

test("only shell or packaging changes count as a desktop change", () => {
  assert.equal(packagedPathsChanged([{ filename: "electron/main.cjs" }]), true);
  assert.equal(packagedPathsChanged([{ filename: "package.json" }]), true);
  assert.equal(packagedPathsChanged([{ filename: "public/brand/mark-512.png" }]), true);
  assert.equal(packagedPathsChanged([{ filename: "src/app/page.tsx" }, { filename: "README.md" }]), false);
  // A truncated or missing compare cannot prove the shell is unchanged.
  assert.equal(packagedPathsChanged(undefined), true);
});
