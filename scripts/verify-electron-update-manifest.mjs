import { access, readFile } from "node:fs/promises";
import path from "node:path";

// Guards the desktop auto-updater: electron-updater resolves the installer from
// the `path` entry in latest.yml, so that name has to survive the trip through
// GitHub releases unchanged (GitHub rewrites spaces to dots) and has to match
// the build the release actually ships.
const releaseDir = process.env.OLANTIS_RELEASE_DIR ?? "release";
const manifestFile = path.join(releaseDir, "latest.yml");

const manifest = await readFile(manifestFile, "utf8").catch(() => null);
if (manifest === null) {
  console.log(`No ${manifestFile} for this platform; skipping update manifest check.`);
  process.exit(0);
}

const readField = (key) => {
  const match = manifest.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1].trim().replace(/^["']|["']$/g, "");
};

const installerName = readField("path");
const manifestVersion = readField("version");
const desktopVersion = JSON.parse(await readFile(path.join("electron", "package.json"), "utf8")).version;

if (!installerName) throw new Error(`${manifestFile} does not name an installer.`);
if (/\s/.test(installerName)) {
  throw new Error(
    `latest.yml points at "${installerName}", which contains spaces. GitHub stores that asset with dots and the updater download 404s.`,
  );
}
if (manifestVersion !== desktopVersion) {
  throw new Error(`latest.yml version ${manifestVersion} does not match electron/package.json ${desktopVersion}.`);
}
await access(path.join(releaseDir, installerName)).catch(() => {
  throw new Error(`latest.yml points at ${installerName}, but ${releaseDir} does not contain it.`);
});

console.log(`Update manifest OK: ${installerName} (Olantis ${manifestVersion}).`);
