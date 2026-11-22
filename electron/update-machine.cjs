// The auto-updater's state machine, kept free of Electron so it can be tested
// as a pure function. main.cjs owns the autoUpdater instance, feeds its events
// in here, and forwards the resulting status to the sidebar through
// app-preload.cjs. It also normalises the release body into the changelog lines
// the sidebar shows before the explicit restart.
//
// Two rules shape the transitions:
//   * A build that finished downloading must survive anything a later check
//     says. It is already on disk and installs on the next quit, so a failed
//     check or a "no update" answer must not throw that away.
//   * Progress only exists while a download is in flight. Every other status
//     reports `percent: null` so the UI never shows a stale bar.

// Quality of life for the changelog panel: GitHub's generated release body is
// Markdown (sometimes HTML), while the sidebar needs a short list of lines.
const RELEASES_URL = "https://github.com/mtlh/olantis/releases/latest";
const MAX_RELEASE_NOTE_ITEMS = 8;
const MAX_RELEASE_NOTE_LENGTH = 180;

const HTML_ENTITY_REPLACEMENTS = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
]);

function decodeHtmlEntity(entity) {
  const named = HTML_ENTITY_REPLACEMENTS.get(entity);
  if (named) return named;
  if (entity.startsWith("#x")) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return Number.isInteger(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  if (entity.startsWith("#")) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return Number.isInteger(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  return `&${entity};`;
}

function decodeHtmlEntities(input) {
  return input.replace(/&([a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/g, (_match, entity) => decodeHtmlEntity(entity));
}

/** GitHub release bodies arrive as Markdown, occasionally wrapped in HTML tags. */
function stripMarkup(input) {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<\/(?:p|div|li|h[1-6]|ul|ol|blockquote)>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  );
}

function cleanReleaseNoteLine(line) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s+by\s+@[\w-]+(?:\s+in\s+https?:\/\/\S+)?$/i, "")
    .replace(/\s*\((?:#\d+(?:,\s*)?)+\)\.?$/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateReleaseNote(item) {
  if (item.length <= MAX_RELEASE_NOTE_LENGTH) return item;
  return `${item.slice(0, MAX_RELEASE_NOTE_LENGTH - 1).trimEnd()}…`;
}

function isIgnoredReleaseNoteLine(line) {
  const normalized = line.toLowerCase();
  return (
    normalized === "" ||
    normalized === "what's changed" ||
    normalized === "whats changed" ||
    normalized.startsWith("full changelog") ||
    normalized.startsWith("compare:") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("http://")
  );
}

function isContributorSection(line) {
  const normalized = line.toLowerCase();
  return normalized === "new contributors" || normalized === "contributors";
}

function releaseNoteEntries(releaseNotes, fallbackVersion) {
  if (Array.isArray(releaseNotes)) {
    return releaseNotes.filter(
      (entry) => typeof entry === "object" && entry !== null && typeof entry.note === "string",
    );
  }
  if (typeof releaseNotes === "string") {
    return [{ version: fallbackVersion, note: releaseNotes }];
  }
  return [];
}

/**
 * Extracts the changelog lines from a release body and de-duplicates them, so
 * they can be used as React keys. Newest first, capped at eight lines.
 */
function parseReleaseNotes(releaseNotes, fallbackVersion) {
  const version = typeof fallbackVersion === "string" ? fallbackVersion : null;
  const entries = releaseNoteEntries(releaseNotes, version);
  const entry = entries.find((candidate) => candidate.version === version) ?? entries[0];
  if (!entry) return { items: [], total: 0 };

  const items = [];
  const seen = new Set();
  let total = 0;
  for (const rawLine of stripMarkup(entry.note).split("\n")) {
    const line = cleanReleaseNoteLine(rawLine);
    if (isContributorSection(line)) break;
    if (isIgnoredReleaseNoteLine(line)) continue;
    total += 1;
    if (items.length >= MAX_RELEASE_NOTE_ITEMS) continue;
    const item = truncateReleaseNote(line);
    if (seen.has(item)) continue;
    seen.add(item);
    items.push(item);
  }

  return { items, total };
}

const CHECK_BACKOFF_MS = [5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000];
// ±15%: enough to keep a fleet of installs from polling in lockstep without
// letting the six-hour cap drift far from six hours.
const CHECK_JITTER = 0.15;

function createUpdateState(init = {}) {
  return {
    enabled: init.enabled ?? true,
    status: "idle",
    currentVersion: init.currentVersion ?? null,
    availableVersion: null,
    downloadedVersion: null,
    percent: null,
    releaseNotes: [],
    releaseUrl: null,
    releasedAt: null,
    errorContext: null,
    canRetry: false,
    checkedAt: null,
  };
}

function clampPercent(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  // One decimal is plenty for a progress bar and keeps payloads small.
  return Math.min(100, Math.max(0, Math.round(numeric * 10) / 10));
}

function withDownload(state, patch) {
  return { ...state, ...patch, status: "downloaded", percent: null, errorContext: null, canRetry: false };
}

function reduceUpdate(state, event) {
  if (!event || typeof event.type !== "string") return state;
  // Events may carry the moment they happened so the reducer stays pure; the
  // caller supplies Date.now() in production and a constant in tests.
  const at = Number.isFinite(event.at) ? event.at : state.checkedAt;

  switch (event.type) {
    case "disable":
      return {
        ...state,
        enabled: false,
        status: "disabled",
        percent: null,
        releaseNotes: [],
        releaseUrl: null,
        releasedAt: null,
        errorContext: null,
        canRetry: false,
      };

    case "check-start":
      // A downloaded build is already better than anything this check can
      // find, so the ready state survives the check instead of flickering.
      return {
        ...state,
        status: state.downloadedVersion ? "downloaded" : "checking",
        percent: null,
        errorContext: null,
        canRetry: false,
        // The next offer decides the changelog; keep the downloaded build's.
        ...(state.downloadedVersion ? {} : { releaseNotes: [], releaseUrl: null, releasedAt: null }),
      };

    case "check-failed": {
      if (state.downloadedVersion) {
        return {
          ...state,
          status: "downloaded",
          percent: null,
          errorContext: null,
          // Nothing to retry: the build is on disk and installs on quit.
          canRetry: false,
          checkedAt: at,
        };
      }
      // A failure after the manifest arrived is a download failure, not a check
      // failure, and the two retries live at different points in the flow.
      const errorContext = state.status === "available" || state.status === "downloading" ? "download" : "check";
      return { ...state, status: "error", percent: null, errorContext, canRetry: true, checkedAt: at };
    }

    case "update-available": {
      const version = event.version ?? state.availableVersion;
      const keepingDownloaded = state.downloadedVersion !== null && state.downloadedVersion === version;
      const notes = parseReleaseNotes(event.releaseNotes, version);
      return {
        ...state,
        status: keepingDownloaded ? "downloaded" : "available",
        availableVersion: version,
        percent: null,
        // An offer that repeats the downloaded build may not carry notes again;
        // the ones already shown still describe it.
        releaseNotes: keepingDownloaded && notes.items.length === 0 ? state.releaseNotes : notes.items,
        releaseUrl: RELEASES_URL,
        releasedAt: event.releaseDate ?? (keepingDownloaded ? state.releasedAt : null),
        errorContext: null,
        canRetry: false,
        checkedAt: at,
      };
    }

    case "download-progress": {
      // The first progress report is what turns "available" into "downloading"
      // (autoDownload starts the transfer as soon as the manifest lands).
      if (state.status !== "available" && state.status !== "downloading") return state;
      return { ...state, status: "downloading", percent: clampPercent(event.percent) };
    }

    case "download-complete": {
      const version = event.version ?? state.availableVersion ?? state.downloadedVersion;
      const notes = parseReleaseNotes(event.releaseNotes, version);
      return withDownload(state, {
        availableVersion: event.version ?? state.availableVersion,
        downloadedVersion: event.version ?? state.availableVersion ?? state.downloadedVersion,
        releaseNotes: notes.items.length > 0 ? notes.items : state.releaseNotes,
        releaseUrl: RELEASES_URL,
        releasedAt: event.releaseDate ?? state.releasedAt,
      });
    }

    case "no-update":
      // A check can only prove the app is current if nothing is waiting on
      // disk. Otherwise the downloaded build is still the newest thing here.
      if (state.downloadedVersion) {
        return { ...state, status: "downloaded", percent: null, errorContext: null, canRetry: false, checkedAt: at };
      }
      return {
        ...state,
        status: "up-to-date",
        availableVersion: null,
        percent: null,
        releaseNotes: [],
        releaseUrl: null,
        releasedAt: null,
        errorContext: null,
        canRetry: false,
        checkedAt: at,
      };

    case "install-failed":
      return {
        ...state,
        status: "error",
        percent: null,
        errorContext: "install",
        // The installer never started, so the downloaded build is still there
        // and clicking restart again is worth another try.
        canRetry: true,
        checkedAt: at,
      };

    default:
      return state;
  }
}

// What the page sees. `downloaded` is named `ready` for the existing sidebar
// control, and the extra fields let the UI show progress, the changelog and a
// retry without inferring any of them from the state name.
function toUpdateStatusPayload(state) {
  return {
    state: state.status === "downloaded" ? "ready" : state.status,
    version: state.downloadedVersion ?? state.availableVersion ?? null,
    percent: state.percent,
    enabled: state.enabled,
    canRetry: state.canRetry,
    errorContext: state.errorContext,
    notes: state.releaseNotes,
    releaseUrl: state.releaseUrl,
    releasedAt: state.releasedAt,
  };
}

// Delay before the next background check. `attempt` counts the checks since the
// last one completed, so a healthy install polls from the 5 minute base and a
// failing one backs off to the six hour cap. Jitter is deterministic when a
// random source is injected, which keeps the schedule testable.
function nextCheckDelayMs(attempt, random = Math.random) {
  const step = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  const base = CHECK_BACKOFF_MS[Math.min(step, CHECK_BACKOFF_MS.length - 1)];
  const spread = (random() * 2 - 1) * CHECK_JITTER;
  return Math.round(base * (1 + spread));
}

module.exports = {
  CHECK_BACKOFF_MS,
  RELEASES_URL,
  createUpdateState,
  nextCheckDelayMs,
  parseReleaseNotes,
  reduceUpdate,
  toUpdateStatusPayload,
};
