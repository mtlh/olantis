import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Runs the electron-builder CLI that is installed in the electron/ workspace
// (the root package.json is free of the desktop toolchain). Args are forwarded
// verbatim; stdio is inherited so progress and errors show in CI logs.
const rootDir = process.cwd();
const electronDir = path.join(rootDir, "electron");
const electronRequire = createRequire(path.join(electronDir, "package.json"));
const builderCli = electronRequire.resolve("electron-builder/out/cli/cli.js");
const args = process.argv.slice(2);

// electron-builder infers the Electron version from node_modules next to the
// project it builds, but the toolchain now lives in electron/node_modules.
// Electron 45 also stopped downloading a binary at install time, so there is no
// dist/version to fall back to. Resolve the version from the workspace and pass
// it explicitly; electron-builder downloads the matching platform binary.
if (!args.some((arg) => arg.includes("electronVersion"))) {
  const electronPackage = JSON.parse(
    fs.readFileSync(electronRequire.resolve("electron/package.json"), "utf8"),
  );
  args.push(`--config.electronVersion=${electronPackage.version}`);
}

const child = spawn(process.execPath, [builderCli, ...args], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env,
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 0));
});
process.exitCode = exitCode;
