// A tiny dependency-free rotating file logger for the desktop main process.
//
// Packaged Windows builds have no terminal, so a failure on a user's machine
// otherwise leaves nothing to read. The file stays bounded: once it passes
// maxBytes it is rotated to name.1, the previous name.1 to name.2, and so on,
// keeping at most maxFiles files in total.
//
// Built-ins come from process.getBuiltinModule rather than require, so the
// repo-wide no-require-imports rule needs no disable here.
const path = process.getBuiltinModule("node:path");

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_LOG_FILES = 3;

/**
 * @param {object} options
 * @param {string} options.dir       Directory the log file lives in (created if missing).
 * @param {string} [options.name]    File name, rotated to `${name}.1`, `${name}.2`, ...
 * @param {number} [options.maxBytes] Rotate once the next line would pass this size.
 * @param {number} [options.maxFiles] Total files kept, including the live one.
 * @param {object} [options.fs]      Injectable fs, for tests.
 */
function createLogFile({ dir, name = "main.log", maxBytes = MAX_LOG_BYTES, maxFiles = MAX_LOG_FILES, fs } = {}) {
  if (typeof dir !== "string" || dir.length === 0) throw new TypeError("createLogFile needs a dir");
  const fileSystem = fs ?? process.getBuiltinModule("node:fs");
  const filePath = path.join(dir, name);
  fileSystem.mkdirSync(dir, { recursive: true });

  function sizeOf(target) {
    try {
      return fileSystem.statSync(target).size;
    } catch {
      // A missing file is an empty file.
      return 0;
    }
  }

  function removeIfExists(target) {
    try {
      fileSystem.rmSync(target, { force: true });
    } catch {
      // Nothing to remove, or it is locked: the next write still succeeds.
    }
  }

  function renameIfExists(from, to) {
    try {
      fileSystem.renameSync(from, to);
    } catch {
      // Missing source is the normal case for the highest numbered file.
    }
  }

  function rotate() {
    if (maxFiles <= 1) {
      removeIfExists(filePath);
      return;
    }
    removeIfExists(`${filePath}.${maxFiles - 1}`);
    for (let index = maxFiles - 2; index >= 1; index -= 1) {
      renameIfExists(`${filePath}.${index}`, `${filePath}.${index + 1}`);
    }
    renameIfExists(filePath, `${filePath}.1`);
  }

  /** Append one line, rotating first if this line would push the file over budget. */
  function write(line) {
    const text = line.endsWith("\n") ? line : `${line}\n`;
    if (sizeOf(filePath) + text.length > maxBytes) rotate();
    fileSystem.appendFileSync(filePath, text);
  }

  return { path: filePath, rotate, write };
}

function describe(value) {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  if (value == null) return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

/** Wrap a log file in `info` / `warn` / `error` calls that carry time and scope. */
function createLogger(logFile, scope) {
  const write = (level, message, detail) => {
    const suffix = detail === undefined ? "" : ` ${describe(detail)}`;
    const line = `${new Date().toISOString()} [${level}] [${scope}] ${describe(message)}${suffix}`;
    try {
      logFile.write(line);
    } catch (error) {
      // Logging must never be the reason a handled failure becomes unhandled.
      console.error("[log] write failed:", error instanceof Error ? error.message : String(error));
    }
    if (level === "warn") console.warn(line);
    if (level === "error") console.error(line);
  };

  return {
    info: (message, detail) => write("info", message, detail),
    warn: (message, detail) => write("warn", message, detail),
    error: (message, detail) => write("error", message, detail),
  };
}

module.exports = { createLogFile, createLogger, MAX_LOG_BYTES, MAX_LOG_FILES };
