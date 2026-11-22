import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards the desktop auto-updater: electron-updater resolves the installer from
// the `path` entry in latest.yml, so that name has to survive the trip through
// GitHub releases unchanged (GitHub rewrites spaces to dots) and has to match
// the build the release actually ships.
//
// A Windows build without latest.yml is worse than a broken manifest: the feed
// 404s and the updater reports an error forever. The manifest checks are kept
// pure so tests can prove that case without writing into release/.
export function validateManifest({ manifest, manifestFile, desktopVersion, windowsInstaller }) {
  if (manifest == null) {
    if (windowsInstaller) {
      throw new Error(
        `${manifestFile} is missing while ${windowsInstaller} ships a Windows installer; electron-updater would 404 on the update feed.`,
      );
    }
    // Another platform's build has no latest.yml of its own; nothing to check.
    return null;
  }

  const readField = (key) => {
    const match = manifest.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return match?.[1].trim().replace(/^["']|["']$/g, "");
  };

  const installerName = readField("path");
  const manifestVersion = readField("version");

  if (!installerName) throw new Error(`${manifestFile} does not name an installer.`);
  if (/\s/.test(installerName)) {
    throw new Error(
      `latest.yml points at "${installerName}", which contains spaces. GitHub stores that asset with dots and the updater download 404s.`,
    );
  }
  if (manifestVersion !== desktopVersion) {
    throw new Error(`latest.yml version ${manifestVersion} does not match electron/package.json ${desktopVersion}.`);
  }

  return { installerName, manifestVersion };
}

async function main() {
  const releaseDir = process.env.OLANTIS_RELEASE_DIR ?? "release";
  const manifestFile = path.join(releaseDir, "latest.yml");

  const manifest = await readFile(manifestFile, "utf8").catch(() => null);
  const entries = await readdir(releaseDir).catch(() => []);
  const windowsInstaller = entries.find((name) => /\.exe$/i.test(name));

  const validated = validateManifest({
    manifest,
    manifestFile,
    desktopVersion: JSON.parse(await readFile(path.join("electron", "package.json"), "utf8")).version,
    windowsInstaller,
  });

  if (!validated) {
    console.log(`No ${manifestFile} for this platform; skipping update manifest check.`);
    return;
  }

  await access(path.join(releaseDir, validated.installerName)).catch(() => {
    throw new Error(`latest.yml points at ${validated.installerName}, but ${releaseDir} does not contain it.`);
  });

  console.log(`Update manifest OK: ${validated.installerName} (Olantis ${validated.manifestVersion}).`);
}

// Only run when invoked as a script; the tests import validateManifest directly.
if (Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
