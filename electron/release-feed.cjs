/* eslint-disable @typescript-eslint/no-require-imports */
// The recent-changes feed behind the sidebar's refresh control. The desktop
// shell is a window onto the deployed site, so a site change needs no installer;
// this only reads what shipped recently from the public GitHub releases.
//
// Kept free of Electron so the payload can be normalised and tested directly.

const { parseReleaseNotes } = require("./release-notes.cjs");

const RELEASES_API_URL = "https://api.github.com/repos/mtlh/olantis/releases?per_page=10";
// Enough to show a couple of days of desktop releases in the popover without
// turning the panel into a scrolling changelog archive.
const MAX_FEED_RELEASES = 6;
// These are exactly the inputs the desktop release workflow watches. A newer
// release only earns a download button when one of them changed since the
// installed build; a rebuild of untouched code is not worth offering.
const PACKAGED_PATHS = ["electron/", "public/brand/", "scripts/run-electron-builder.mjs"];
const PACKAGED_FILES = new Set(["package.json", "package-lock.json"]);
const INSTALLER_EXTENSIONS = {
  win32: [".exe"],
  darwin: [".dmg", ".zip"],
  linux: [".AppImage", ".deb"],
};

function readString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readAssets(value) {
  if (!Array.isArray(value)) return [];
  const assets = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const name = readString(entry.name);
    const url = readString(entry.browser_download_url);
    if (name && url) assets.push({ name, url });
  }
  return assets;
}

/**
 * GitHub returns the newest release first. Drafts are not published yet, so
 * they must never appear; everything else becomes one entry with the notes the
 * release page already shows.
 */
function normalizeReleaseFeed(payload, limit = MAX_FEED_RELEASES) {
  if (!Array.isArray(payload)) return [];
  const cap = Number.isInteger(limit) && limit > 0 ? limit : MAX_FEED_RELEASES;
  const releases = [];
  for (const candidate of payload) {
    if (typeof candidate !== "object" || candidate === null || candidate.draft === true) continue;
    const version = readString(candidate.tag_name);
    const publishedAt = readString(candidate.published_at);
    const notes = parseReleaseNotes(readString(candidate.body), version).items;
    if (!version && notes.length === 0) continue;
    releases.push({
      version,
      title: readString(candidate.name) ?? version,
      publishedAt,
      url: readString(candidate.html_url),
      notes,
      assets: readAssets(candidate.assets),
    });
    if (releases.length >= cap) break;
  }
  return releases;
}

/** "0.1.74" (the version stamped into the app) → 74. */
function versionBuildNumber(version) {
  if (typeof version !== "string") return null;
  const match = version.trim().match(/^0\.1\.(\d+)$/);
  return match ? Number(match[1]) : null;
}

/** "desktop-74-abcdef" (the release tag) → 74. */
function tagBuildNumber(tag) {
  if (typeof tag !== "string") return null;
  const match = tag.trim().match(/^desktop-(\d+)-/);
  return match ? Number(match[1]) : null;
}

/** The newest desktop release in the feed, judged by its build number. */
function latestDesktopRelease(releases) {
  let latest = null;
  for (const release of releases) {
    const build = tagBuildNumber(release.version);
    if (build === null) continue;
    if (!latest || build > latest.build) latest = { release, build };
  }
  return latest;
}

/** The installer a given platform should download from a release. */
function platformInstaller(assets, platform) {
  const extensions = INSTALLER_EXTENSIONS[platform] ?? [];
  for (const extension of extensions) {
    const match = assets.find((asset) => asset.name.toLowerCase().endsWith(extension.toLowerCase()));
    if (match) return match;
  }
  return null;
}

/**
 * The download offer the sidebar may show, or null when the installed build is
 * current or the only difference is web-only. `desktopChanged` is supplied by
 * the caller after comparing the installed release with the newest one.
 */
function desktopUpdate({ currentVersion, releases, platform, desktopChanged }) {
  const currentBuild = versionBuildNumber(currentVersion);
  if (currentBuild === null) return null;
  const latest = latestDesktopRelease(releases);
  if (!latest || latest.build <= currentBuild) return null;
  if (!desktopChanged) return null;
  const installer = platformInstaller(latest.release.assets, platform);
  return {
    version: latest.release.version,
    title: latest.release.title,
    build: latest.build,
    appVersion: `0.1.${latest.build}`,
    publishedAt: latest.release.publishedAt,
    releaseUrl: latest.release.url,
    downloadUrl: installer?.url ?? null,
    installerName: installer?.name ?? null,
  };
}

/** True when a GitHub compare payload touched anything the installer ships. */
function packagedPathsChanged(files) {
  if (!Array.isArray(files)) return true;
  // GitHub caps the compare file list, so a full page cannot prove the shell is
  // unchanged; offering the newer installer is safer than hiding it.
  if (files.length >= 300) return true;
  for (const file of files) {
    const filename = readString(file?.filename);
    if (!filename) continue;
    if (PACKAGED_FILES.has(filename)) return true;
    if (PACKAGED_PATHS.some((prefix) => filename.startsWith(prefix))) return true;
  }
  return false;
}

module.exports = {
  MAX_FEED_RELEASES,
  PACKAGED_PATHS,
  RELEASES_API_URL,
  desktopUpdate,
  latestDesktopRelease,
  normalizeReleaseFeed,
  packagedPathsChanged,
  platformInstaller,
  tagBuildNumber,
  versionBuildNumber,
};
