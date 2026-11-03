// WorkOS AuthKit fronts every workspace, and it hands the sign-in off to the
// identity provider (Google, Microsoft, Apple, GitHub) the user picks. Because
// the whole chain has to finish in the app window — the PKCE cookie and the
// resulting session live in the desktop session, not in the system browser —
// every host in the chain is trusted, not just WorkOS itself.
const TRUSTED_AUTH_DOMAINS = ["workos.com", "workos.dev", "authkit.app"];
const TRUSTED_IDENTITY_HOSTS = [
  "accounts.google.com",
  "accounts.youtube.com",
  "login.microsoftonline.com",
  "login.microsoft.com",
  "login.live.com",
  "appleid.apple.com",
];
// GitHub is a normal destination as well as an identity provider, so only its
// OAuth entry points are trusted instead of the whole site.
const TRUSTED_IDENTITY_PATHS = [
  ["github.com", "/login"],
  ["github.com", "/session"],
  ["github.com", "/sessions"],
];

function isSameOrSubdomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isTrustedAuthUrl(candidate) {
  try {
    const target = new URL(candidate);
    if (target.protocol !== "https:") return false;
    if (TRUSTED_AUTH_DOMAINS.some((domain) => isSameOrSubdomain(target.hostname, domain))) return true;
    if (TRUSTED_IDENTITY_HOSTS.includes(target.hostname)) return true;
    return TRUSTED_IDENTITY_PATHS.some(
      ([hostname, prefix]) => target.hostname === hostname && target.pathname.startsWith(prefix),
    );
  } catch {
    return false;
  }
}

function isAllowedNavigation(candidate, appUrl, currentUrl) {
  try {
    const target = new URL(candidate);
    const app = new URL(appUrl);

    if (target.origin === app.origin) return true;
    if (target.protocol !== "https:") return false;
    if (isTrustedAuthUrl(candidate)) return true;

    // WorkOS hands off to each workspace's configured identity provider (which
    // may be a private SSO domain), and providers move between their own pages
    // as the user signs in. Both are permitted only while the window is already
    // inside the auth chain.
    return currentUrl ? isTrustedAuthUrl(currentUrl) : false;
  } catch {
    return false;
  }
}

function isExternalWebUrl(candidate) {
  try {
    const { protocol } = new URL(candidate);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

module.exports = { isAllowedNavigation, isExternalWebUrl };
