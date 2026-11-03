import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

// Runs the electron-builder CLI that is installed in the electron/ workspace
// (the root package.json is free of the desktop toolchain). Args are forwarded
// verbatim; stdio is inherited so progress and errors show in CI logs.
const rootDir = process.cwd();
const electronDir = path.join(rootDir, "electron");
const builderCli = createRequire(path.join(electronDir, "package.json")).resolve(
  "electron-builder/out/cli/cli.js",
);
const args = process.argv.slice(2);

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
