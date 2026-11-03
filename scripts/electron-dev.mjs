import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");

// electron lives in the electron/ workspace now; the root package is free of
// the desktop toolchain. Resolve the binary from there so `npm run electron:dev`
// works without reinstalling anything at the root.
const electronRequire = createRequire(path.join(process.cwd(), "electron", "package.json"));
const electronBinary = electronRequire("electron");
const appUrl = "http://localhost:3000";
const smokeTest = process.argv.includes("--smoke-test");

let nextServer;
let electronApp;
let shuttingDown = false;

function stopNext() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (nextServer?.exitCode === null) nextServer.kill();
}

process.once("SIGINT", () => {
  electronApp?.kill();
  stopNext();
});
process.once("SIGTERM", () => {
  electronApp?.kill();
  stopNext();
});
try {
  let serverReady = false;
  try {
    const response = await fetch(appUrl);
    serverReady = response.status < 500;
    if (serverReady) console.log("Using the existing Next.js server on localhost:3000.");
  } catch {
    // Start a local Next.js process below.
  }

  if (!serverReady) {
    nextServer = spawn(
      process.execPath,
      [nextCli, "dev", "--hostname", "127.0.0.1", "--port", "3000"],
      { stdio: "inherit", env: process.env },
    );
    nextServer.once("exit", (code) => {
      if (!shuttingDown && electronApp) electronApp.kill();
      if (!shuttingDown && code) process.exitCode = code;
    });

    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (nextServer.exitCode !== null) {
        throw new Error(`Next.js exited before becoming ready (code ${nextServer.exitCode}).`);
      }
      try {
        const response = await fetch(appUrl);
        if (response.status < 500) {
          serverReady = true;
          break;
        }
      } catch {
        // Next.js is still starting.
      }
      await delay(500);
    }
  }

  if (!serverReady) throw new Error("Next.js did not become ready within 60 seconds.");

  electronApp = spawn(electronBinary, ["electron", ...(smokeTest ? ["--smoke-test"] : [])], {
    stdio: "inherit",
    env: { ...process.env, OLANTIS_ELECTRON_URL: appUrl },
    cwd: path.join(process.cwd(), "electron"),
  });

  const exitCode = await new Promise((resolve, reject) => {
    electronApp.once("error", reject);
    electronApp.once("exit", (code) => resolve(code ?? 0));
  });
  process.exitCode = exitCode;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  stopNext();
}
