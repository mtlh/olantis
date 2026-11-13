// Where the first frame comes from.
//
// The web app's "/" renders the marketing page on the server and only then
// redirects a signed-in visitor to /dashboard, so every signed-in launch pays
// for two serverless renders (about 230ms each on Vercel) before the dashboard
// HTML even starts. The session cookie is enough to pick the destination
// locally. The page still enforces auth exactly as before, so a cookie that has
// gone stale simply lands on /login instead of the landing page.
const SESSION_COOKIE_NAMES = ["wos-session", "olantis_demo"];
const SIGNED_IN_PATH = "/dashboard";

// AuthKit chunks a large session JWT into wos-session-0, wos-session-1, ...
// so a prefix match is what covers every shape.
function isSessionCookie(cookie) {
  return SESSION_COOKIE_NAMES.some((name) => cookie.name === name || cookie.name.startsWith(`${name}-`));
}

function resolveEntryUrl(baseUrl, cookies, signedInPath = SIGNED_IN_PATH) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return baseUrl;
  }
  // An explicitly configured entry with its own path, query or hash is the
  // caller's choice and is never overridden.
  if (base.pathname !== "/" || base.search || base.hash) return baseUrl;
  if (!Array.isArray(cookies) || !cookies.some(isSessionCookie)) return baseUrl;
  return new URL(signedInPath, baseUrl).href;
}

module.exports = { isSessionCookie, resolveEntryUrl, SIGNED_IN_PATH };
