// The auto-updater's state machine, kept free of Electron so it can be tested
// as a pure function. main.cjs owns the autoUpdater instance, feeds its events
// in here, and forwards the resulting status to the sidebar through
// app-preload.cjs.
//
// Two rules shape the transitions:
//   * A build that finished downloading must survive anything a later check
//     says. It is already on disk and installs on the next quit, so a failed
//     check or a "no update" answer must not throw that away.
//   * Progress only exists while a download is in flight. Every other status
//     reports `percent: null` so the UI never shows a stale bar.

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
      return { ...state, enabled: false, status: "disabled", percent: null, errorContext: null, canRetry: false };

    case "check-start":
      // A downloaded build is already better than anything this check can
      // find, so the ready state survives the check instead of flickering.
      return { ...state, status: state.downloadedVersion ? "downloaded" : "checking", percent: null, errorContext: null, canRetry: false };

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

    case "update-available":
      return {
        ...state,
        status: state.downloadedVersion ? "downloaded" : "available",
        availableVersion: event.version ?? state.availableVersion,
        percent: null,
        errorContext: null,
        canRetry: false,
        checkedAt: at,
      };

    case "download-progress": {
      // The first progress report is what turns "available" into "downloading"
      // (autoDownload starts the transfer as soon as the manifest lands).
      if (state.status !== "available" && state.status !== "downloading") return state;
      return { ...state, status: "downloading", percent: clampPercent(event.percent) };
    }

    case "download-complete":
      return withDownload(state, {
        availableVersion: event.version ?? state.availableVersion,
        downloadedVersion: event.version ?? state.availableVersion ?? state.downloadedVersion,
      });

    case "no-update":
      // A check can only prove the app is current if nothing is waiting on
      // disk. Otherwise the downloaded build is still the newest thing here.
      if (state.downloadedVersion) {
        return { ...state, status: "downloaded", percent: null, errorContext: null, canRetry: false, checkedAt: at };
      }
      return { ...state, status: "up-to-date", availableVersion: null, percent: null, errorContext: null, canRetry: false, checkedAt: at };

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
// control, and the extra fields let the UI show progress and offer a retry
// without inferring either from the state name.
function toUpdateStatusPayload(state) {
  return {
    state: state.status === "downloaded" ? "ready" : state.status,
    version: state.downloadedVersion ?? state.availableVersion ?? null,
    percent: state.percent,
    enabled: state.enabled,
    canRetry: state.canRetry,
    errorContext: state.errorContext,
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
  createUpdateState,
  nextCheckDelayMs,
  reduceUpdate,
  toUpdateStatusPayload,
};
