// Recovery budget and retry timing for the desktop shell.
//
// Kept free of Electron so the policy can be unit-tested with plain Node. A
// window that crashes repeatedly must not reload forever: after
// RECOVERY_MAX_ATTEMPTS inside RECOVERY_WINDOW_MS the shell shows an error panel
// instead, and only becomes eligible again once the oldest attempt has aged out
// of the window.
const RECOVERY_MAX_ATTEMPTS = 3;
const RECOVERY_WINDOW_MS = 60_000;
// Backoff for a failed main-frame load, in order.
const RETRY_DELAYS_MS = [500, 1500, 4000];
// Chromium net errors that are worth another attempt: connection refused,
// timeout, host unreachable, SSL/protocol hiccups and aborted transfers.
const RETRYABLE_LOAD_ERRORS = new Set([-2, -7, -9, -102, -105, -106, -118]);

function attemptsWithinWindow(attemptTimestamps, now, windowMs) {
  return attemptTimestamps.filter(
    (timestamp) => Number.isFinite(timestamp) && now - timestamp < windowMs,
  );
}

/**
 * Decide whether one more recovery reload is allowed.
 *
 * Returns `{ recover: true, delayMs }` while the attempts inside the window are
 * below the budget. Once the budget is spent it returns `{ recover: false,
 * delayMs }`, where `delayMs` is how long until the oldest attempt falls out of
 * the window and a reload becomes eligible again.
 */
function nextRecoveryDelay(attemptTimestamps, now, options = {}) {
  const {
    delayMs = 500,
    maxAttempts = RECOVERY_MAX_ATTEMPTS,
    windowMs = RECOVERY_WINDOW_MS,
  } = options;
  const attempts = Array.isArray(attemptTimestamps) ? attemptTimestamps : [];
  const recent = attemptsWithinWindow(attempts, now, windowMs);
  if (recent.length < maxAttempts) return { recover: true, delayMs };
  const oldest = recent.reduce((earliest, timestamp) => Math.min(earliest, timestamp), Infinity);
  return { recover: false, delayMs: Math.max(0, windowMs - (now - oldest)) };
}

/** Backoff for load attempt `attempt`, or null once the budget is used up. */
function nextRetryDelay(attempt) {
  return RETRY_DELAYS_MS[attempt] ?? null;
}

function isRetryableLoadError(code) {
  return RETRYABLE_LOAD_ERRORS.has(code);
}

module.exports = {
  RECOVERY_MAX_ATTEMPTS,
  RECOVERY_WINDOW_MS,
  RETRY_DELAYS_MS,
  isRetryableLoadError,
  nextRecoveryDelay,
  nextRetryDelay,
};
