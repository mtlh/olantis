const TRUSTED_AUTH_DOMAINS = ["workos.com", "workos.dev", "authkit.app"];

function isTrustedAuthUrl(candidate) {
  try {
    const target = new URL(candidate);
    return target.protocol === "https:" && TRUSTED_AUTH_DOMAINS.some(
      (domain) => target.hostname === domain || target.hostname.endsWith(`.${domain}`),
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

    // WorkOS hands off to each user's configured identity provider (which may
    // be a private SSO domain). Permit that hand-off only while on WorkOS.
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
