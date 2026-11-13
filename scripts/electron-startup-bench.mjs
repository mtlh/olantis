// Measures Olantis desktop cold-start milestones by launching the real Electron
// app N times and reading the OLANTIS-TRACE marks that electron/main.cjs emits
// when OLANTIS_STARTUP_TRACE=1.
//
// Usage:
//   node scripts/electron-startup-bench.mjs --label baseline --runs 7
//   node scripts/electron-startup-bench.mjs --url https://olantis.vercel.app
//   node scripts/electron-startup-bench.mjs --fresh-profile --json out.json
//   node scripts/electron-startup-bench.mjs --app electron/main.baseline.cjs \
//     --compare electron/main.cjs --runs 12
//
// Every timing below is milliseconds from the moment the electron.exe process is
// spawned, so the numbers cover the whole launch path: process bootstrap, main
// script, app ready, window creation, the titlebar shell, and the embedded app
// page (TTFB, DOM ready, first paint, reveal, load).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = path.resolve(import.meta.dirname, "..");
// The desktop toolchain lives in the electron/ workspace (see package.json), so
// resolve the binary from there rather than the root package.
const electronRequire = createRequire(path.join(repoRoot, "electron", "package.json"));
const electronBinary = electronRequire("electron");

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
// A persistent profile keeps the HTTP cache warm between runs, like a real
// install does. It is wiped once at the start of the session unless --keep-profile.
const profileArg = readArg("profile", null);
// Point this at release/win-unpacked/Olantis.exe to benchmark the packaged app
// (asar, no dev tooling, auto-updater enabled) instead of `electron .`.
const exePath = readArg("exe", null);
// An app entry to measure instead of the electron/ directory, e.g.
// "electron/main.baseline.cjs". --compare runs the two entries alternately in
// one session so machine drift lands on both, and prints a per-milestone delta.
const appEntry = readArg("app", null);
const compareEntry = readArg("compare", null);
const entries = compareEntry
  ? [
      { variant: "base", entry: appEntry },
      { variant: "new", entry: compareEntry },
    ]
  : [{ variant: "", entry: appEntry }];

if (!Number.isFinite(runs) || runs < 1) throw new Error("--runs must be a positive number");
if (compareEntry && !appEntry) throw new Error("--compare needs --app <entry> to compare against");
if (compareEntry && exePath) throw new Error("--compare measures two app entries; drop --exe");

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
function launch({ profileDir, entry }) {
  return new Promise((resolve, reject) => {
    const spawnAt = Date.now();
    const traceFile = path.join(
      traceDir,
      `run-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
    );
    writeFileSync(traceFile, "");
    const child = spawn(exePath ? path.resolve(String(exePath)) : electronBinary, exePath ? [] : [entry ? String(entry) : "electron"], {
      cwd: repoRoot,
      env: (() => {
        const env = {
          ...process.env,
          OLANTIS_ELECTRON_URL: appUrl,
          OLANTIS_STARTUP_TRACE: "1",
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

    const wanted = ["view:metrics:painted", "window:shown"];
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
  const painted = firstMark(result, "view:metrics:painted");
  const mark = (event) => {
    const found = firstMark(result, event);
    return found ? toSpawn(processEpoch + found.ms) : null;
  };
  const pageMark = (metrics, key) => (metrics && typeof metrics[key] === "number" ? toSpawn(metrics.timeOrigin + metrics[key]) : null);
  // Paint milestones come from the page's own PerformancePaintTiming entries:
  // Chromium does not rasterise a hidden view, so they only exist once the view
  // has been revealed (see dom-ready in electron/main.cjs).
  const paints = new Map(Array.isArray(painted?.paints) ? painted.paints : []);
  const paintMark = (name) => (paints.has(name) ? toSpawn(painted.timeOrigin + paints.get(name)) : null);

  return {
    "process start → main script": toSpawn(processEpoch),
    "→ app ready": mark("app:ready"),
    "→ window created": mark("shell:window-created"),
    "→ window visible": mark("window:shown"),
    "→ app view starts loading": mark("view:did-start-loading"),
    "→ app view DOM ready": mark("view:dom-ready"),
    // The headline number: the moment the remote page replaces the splash mark.
    "→ app revealed": mark("view:revealed"),
    "→ app load complete": mark("view:did-finish-load"),
    "→ app first paint": paintMark("first-paint"),
    "→ app first contentful paint": paintMark("first-contentful-paint"),
    "page TTFB (from view nav)": pageMark(loaded, "ttfb"),
    // Absolute moments for the document that actually stayed in the view. When
    // the entry URL redirects, this is the hop the launch had to pay for.
    "→ final document request": loaded ? toSpawn(loaded.timeOrigin) : null,
    "→ final document response": pageMark(loaded, "ttfb"),
    "page DOMContentLoaded": pageMark(loaded, "domContentLoaded"),
    "page FCP (from view nav)": pageMark(loaded, "fcp"),
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
const jsonTarget = jsonPath ? path.resolve(String(jsonPath)) : null;
// Traces are small; when --json asks for results they are written next to them
// so a surprising number can be inspected afterwards.
const traceDir = jsonTarget
  ? path.join(path.dirname(jsonTarget), `${path.basename(jsonTarget, ".json")}-traces`)
  : mkdtempSync(path.join(tmpdir(), "olantis-traces-"));
rmSync(traceDir, { recursive: true, force: true });
mkdirSync(traceDir, { recursive: true });
const keepTraces = Boolean(jsonTarget);

console.log(`Olantis desktop startup — ${label}`);
console.log(`url: ${appUrl} (first response ${status})`);
console.log(`binary: ${exePath ? path.resolve(String(exePath)) : `${electronBinary} .`}`);
console.log(`runs: ${runs}, profile: ${profileDir ? profileDir : "default"}`);
console.log("");

const results = [];
const rowsByVariant = new Map(entries.map((entry) => [entry.variant, []]));
for (let index = 0; index < runs + warmupRuns; index += 1) {
  const isWarmup = index < warmupRuns;
  const { variant, entry } = entries[index % entries.length];
  if (freshProfile && index > 0) {
    // A fresh profile means "first launch on a new machine" every time.
    rmSync(profileDir, { recursive: true, force: true });
  }
  const result = await launch({ profileDir: profileDir ?? undefined, entry });
  const row = measuresFor(result);
  const page = firstMark(result, "view:metrics:loaded") ?? {};
  const reveal = row["→ app revealed"] ?? row["→ app load complete"] ?? row["→ app view DOM ready"];
  const fcp = row["→ app first contentful paint"];
  const prefix = variant ? `${variant.padEnd(4)} ` : "";
  if (isWarmup) {
    console.log(`${prefix}warmup: ${result.reason}, reveal ${reveal ? reveal.toFixed(0) : "-"}ms (not counted)`);
  } else {
    results.push(row);
    rowsByVariant.get(variant).push(row);
    console.log(
      `${prefix}run ${String(index - warmupRuns + 1).padStart(2)}: ${result.reason.padEnd(7)} visible ${(
        row["→ window visible"] ?? 0
      ).toFixed(0)}ms, reveal ${reveal ? reveal.toFixed(0) : "-"}ms${fcp ? `, fcp ${fcp.toFixed(0)}ms` : ""} — ${
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
for (const { variant } of entries) {
  if (compareEntry) console.log(`--- ${variant} ---`);
  console.log(formatTable(rowsByVariant.get(variant)));
  console.log("");
}

if (compareEntry) {
  const [a, b] = entries.map((entry) => rowsByVariant.get(entry.variant));
  const names = [...new Set(a.flatMap((row) => Object.keys(row)))];
  const delta = (values) => {
    const stats = summarize(values);
    return stats ? stats.p50 : null;
  };
  console.log(`${"milestone (ms from launch)".padEnd(30)} ${"base p50".padStart(8)} ${"new p50".padStart(8)} ${"delta".padStart(8)}`);
  console.log("-".repeat(58));
  for (const name of names) {
    const base = delta(a.map((row) => row[name]));
    const next = delta(b.map((row) => row[name]));
    if (base === null || next === null) {
      console.log(`${name.padEnd(30)} ${"no data".padStart(8)}`);
      continue;
    }
    const change = next - base;
    const sign = change > 0 ? "+" : "";
    console.log(`${name.padEnd(30)} ${base.toFixed(0).padStart(8)} ${next.toFixed(0).padStart(8)} ${(sign + change.toFixed(0)).padStart(8)}`);
  }
  console.log("");
}

if (jsonTarget) {
  const summary = Object.fromEntries(
    Object.keys(results[0] ?? {}).map((name) => [name, summarize(results.map((row) => row[name]))]),
  );
  mkdirSync(path.dirname(jsonTarget), { recursive: true });
  writeFileSync(
    jsonTarget,
    JSON.stringify(
      {
        label,
        url: appUrl,
        binary: exePath ? path.resolve(String(exePath)) : "electron .",
        appEntry: appEntry ? String(appEntry) : null,
        compareEntry: compareEntry ? String(compareEntry) : null,
        runs,
        freshProfile,
        summary,
        rows: results,
        variants: compareEntry
          ? Object.fromEntries(entries.map((entry) => [entry.variant, rowsByVariant.get(entry.variant)]))
          : undefined,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${jsonTarget}`);
}

if (!keepTraces) rmSync(traceDir, { recursive: true, force: true });
else console.log(`traces kept in ${traceDir}`);
if (profileDir) rmSync(profileDir, { recursive: true, force: true });
