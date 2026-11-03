// Measures Olantis desktop cold-start milestones by launching the real Electron
// app N times and reading the OLANTIS-TRACE marks that electron/main.cjs emits
// when OLANTIS_STARTUP_TRACE=1.
//
// Usage:
//   node scripts/electron-startup-bench.mjs --label baseline --runs 7
//   node scripts/electron-startup-bench.mjs --url https://olantis.vercel.app
//   node scripts/electron-startup-bench.mjs --fresh-profile --json out.json
//
// Every timing below is milliseconds from the moment the electron.exe process is
// spawned, so the numbers cover the whole launch path: process bootstrap, main
// script, app ready, window creation, the titlebar shell, and the embedded app
// page (TTFB, DOM ready, first contentful paint, load).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "..");
const electronBinary = require("electron");

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

const appUrl = String(readArg("url", process.env.OLANTIS_ELECTRON_URL || "http://127.0.0.1:3000"));
const runs = Number(readArg("runs", 7));
// The first launch after a build pays for Defender scans and OS file caches;
// discard it unless asked otherwise.
const warmupRuns = Number(readArg("warmup", 1));
const label = String(readArg("label", "run"));
const timeoutMs = Number(readArg("timeout", 30000));
const freshProfile = Boolean(readArg("fresh-profile", false));
const jsonPath = readArg("json", null);
// Trace level 2 adds Chromium's paint lifecycle (via the devtools protocol).
const traceLevel = String(readArg("trace-level", 1));
// A persistent profile keeps the HTTP cache warm between runs, like a real
// install does. It is wiped once at the start of the session unless --keep-profile.
const profileArg = readArg("profile", null);
// Point this at release/win-unpacked/Olantis.exe to benchmark the packaged app
// (asar, no dev tooling, auto-updater enabled) instead of `electron .`.
const exePath = readArg("exe", null);

if (!Number.isFinite(runs) || runs < 1) throw new Error("--runs must be a positive number");

async function assertServerReachable(url) {
  try {
    const response = await fetch(url, { redirect: "manual" });
    return response.status;
  } catch (error) {
    throw new Error(`Cannot reach ${url}: ${error instanceof Error ? error.message : error}`);
  }
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

/**
 * Launch the app once and resolve with the trace marks it produced.
 * The launch is considered finished once the embedded page has loaded, or when
 * the timeout expires. Marks arrive through a per-run trace file because a
 * packaged Windows build has no stdout for us to read.
 */
function launch({ profileDir }) {
  return new Promise((resolve, reject) => {
    const spawnAt = Date.now();
    const traceFile = path.join(
      traceDir,
      `run-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
    );
    writeFileSync(traceFile, "");
    const child = spawn(exePath ? path.resolve(String(exePath)) : electronBinary, exePath ? [] : ["electron"], {
      cwd: repoRoot,
      env: (() => {
        const env = {
          ...process.env,
          OLANTIS_ELECTRON_URL: appUrl,
          OLANTIS_STARTUP_TRACE: traceLevel,
          OLANTIS_STARTUP_TRACE_FILE: traceFile,
          ...(profileDir ? { OLANTIS_ELECTRON_PROFILE: profileDir } : {}),
        };
        // Some terminals (and coding agents) export this; it turns Electron into
        // plain Node and the app never starts.
        delete env.ELECTRON_RUN_AS_NODE;
        return env;
      })(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let settled = false;

    const readMarks = () => {
      let text = "";
      try {
        text = readFileSync(traceFile, "utf8");
      } catch {
        return [];
      }
      return text
        .split("\n")
        .filter((line) => line.startsWith("OLANTIS-TRACE "))
        .flatMap((line) => {
          try {
            return [JSON.parse(line.slice("OLANTIS-TRACE ".length))];
          } catch {
            return [];
          }
        });
    };

    const finish = (reason) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      clearTimeout(settle);
      killTree(child);
      resolve({ spawnAt, marks: readMarks(), reason, stderr });
    };

    const wanted = ["view:metrics:loaded", "window:shown"];
    if (Number(traceLevel) > 1) wanted.push("paint:firstContentfulPaint");
    const poll = setInterval(() => {
      const seen = new Set(readMarks().map((mark) => mark.event));
      if (wanted.every((event) => seen.has(event))) finish("loaded");
    }, 40);
    // The window may never paint (offline, slow page); return what we have.
    const settle = setTimeout(() => finish("settled"), Math.min(timeoutMs, 8000));
    const timer = setTimeout(() => finish("timeout"), timeoutMs);

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearInterval(poll);
      clearTimeout(timer);
      clearTimeout(settle);
      reject(error);
    });
    child.once("exit", () => finish("exited"));
  });
}

function firstMark(result, event) {
  return result.marks.find((mark) => mark.event === event) ?? null;
}

/** One measurement row: a stable name plus its value in ms from process spawn. */
function measuresFor(result) {
  const moduleMark = firstMark(result, "main:module-loaded");
  if (!moduleMark) return {};
  const processEpoch = moduleMark.timeOrigin;
  const toSpawn = (epochMs) => epochMs - result.spawnAt;

  const loaded = firstMark(result, "view:metrics:loaded");
  const mark = (event) => {
    const found = firstMark(result, event);
    return found ? toSpawn(processEpoch + found.ms) : null;
  };
  const pageMark = (metrics, key) => (metrics && typeof metrics[key] === "number" ? toSpawn(metrics.timeOrigin + metrics[key]) : null);

  return {
    "process start → main script": toSpawn(processEpoch),
    "→ app ready": mark("app:ready"),
    "→ window created": mark("shell:window-created"),
    "→ window visible": mark("window:shown"),
    "→ app view starts loading": mark("view:did-start-loading"),
    "→ app view DOM ready": mark("view:dom-ready"),
    "→ app load complete": mark("view:did-finish-load"),
    "→ app first paint": mark("paint:firstPaint"),
    "→ app first contentful paint": mark("paint:firstContentfulPaint"),
    "page TTFB (from view nav)": pageMark(loaded, "ttfb"),
    "page DOMContentLoaded": pageMark(loaded, "domContentLoaded"),
  };
}

function summarize(values) {
  const sorted = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  return {
    n: sorted.length,
    min: sorted[0],
    p50: pick(0.5),
    p90: pick(0.9),
    max: sorted[sorted.length - 1],
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  };
}

function formatTable(rows) {
  const names = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const stats = names.map((name) => ({ name, stats: summarize(rows.map((row) => row[name])) }));
  const cell = (value) => (typeof value === "number" ? value.toFixed(0).padStart(6) : "     -");
  const lines = [
    `${"milestone (ms from launch)".padEnd(30)} ${"min".padStart(6)} ${"p50".padStart(6)} ${"p90".padStart(6)} ${"max".padStart(6)} ${"mean".padStart(6)}`,
    "-".repeat(70),
  ];
  for (const { name, stats: s } of stats) {
    lines.push(
      s
        ? `${name.padEnd(30)} ${cell(s.min)} ${cell(s.p50)} ${cell(s.p90)} ${cell(s.max)} ${cell(s.mean)}`
        : `${name.padEnd(30)} ${"no data".padStart(6)}`,
    );
  }
  return lines.join("\n");
}

const status = await assertServerReachable(appUrl);
const profileDir = freshProfile
  ? mkdtempSync(path.join(tmpdir(), "olantis-bench-"))
  : profileArg
    ? path.resolve(String(profileArg))
    : null;
if (profileDir && !freshProfile) {
  // Start from a clean, reusable profile so every measured session is equal.
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
}
const traceDir = mkdtempSync(path.join(tmpdir(), "olantis-traces-"));
// Traces are small; write them next to the results when --json is used so a
// surprising number can be inspected afterwards.
const keepTraces = Boolean(jsonPath);

console.log(`Olantis desktop startup — ${label}`);
console.log(`url: ${appUrl} (first response ${status})`);
console.log(`binary: ${exePath ? path.resolve(String(exePath)) : `${electronBinary} .`}`);
console.log(`runs: ${runs}, profile: ${profileDir ? profileDir : "default"}, trace level ${traceLevel}`);
console.log("");

const results = [];
for (let index = 0; index < runs + warmupRuns; index += 1) {
  const isWarmup = index < warmupRuns;
  if (freshProfile && index > 0) {
    // A fresh profile means "first launch on a new machine" every time.
    rmSync(profileDir, { recursive: true, force: true });
  }
  const result = await launch({ profileDir: profileDir ?? undefined });
  const row = measuresFor(result);
  const page = firstMark(result, "view:metrics:loaded") ?? {};
  const load = row["→ app load complete"] ?? row["→ app view DOM ready"];
  const fcp = row["→ app first contentful paint"];
  if (isWarmup) {
    console.log(`warmup: ${result.reason}, load ${load ? load.toFixed(0) : "-"}ms (not counted)`);
  } else {
    results.push(row);
    console.log(
      `run ${String(index - warmupRuns + 1).padStart(2)}: ${result.reason.padEnd(7)} visible ${(
        row["→ window visible"] ?? 0
      ).toFixed(0)}ms, load ${load ? load.toFixed(0) : "-"}ms${fcp ? `, fcp ${fcp.toFixed(0)}ms` : ""} — ${
        page.href ?? "no page"
      } (${page.textLength ?? 0} chars)`,
    );
  }
  if (result.reason === "timeout") {
    console.log(result.stderr.split("\n").slice(-5).join("\n"));
  }
  await delay(1200);
}

console.log("");
console.log(formatTable(results));

if (jsonPath) {
  const summary = Object.fromEntries(
    Object.keys(results[0] ?? {}).map((name) => [name, summarize(results.map((row) => row[name]))]),
  );
  const target = path.resolve(String(jsonPath));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(
    target,
    JSON.stringify({ label, url: appUrl, binary: exePath ? path.resolve(String(exePath)) : "electron .", runs, freshProfile, summary, rows: results }, null, 2),
  );
  console.log(`\nwrote ${jsonPath}`);
}

if (!keepTraces) rmSync(traceDir, { recursive: true, force: true });
if (profileDir) rmSync(profileDir, { recursive: true, force: true });
