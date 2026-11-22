// WorkOS keeps the whole sign-in chain — WorkOS, AuthKit and the identity
// provider (Google, Microsoft, Apple, GitHub) — inside the app window, because
// the PKCE cookie and the resulting session live in the desktop session. That
// also means a third-party page shares a renderer with the workspace, so every
// capability it can ask for is a capability an identity provider could ask for.
// Notifications are the only grant, and only to the app's own origin.
const ALLOWED_PERMISSIONS = ["notifications"];

function originOf(candidate) {
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function isPermissionAllowed(permission, requestingUrl, appUrl) {
  if (!ALLOWED_PERMISSIONS.includes(permission)) return false;
  const requestingOrigin = originOf(requestingUrl);
  if (requestingOrigin == null) return false;
  return requestingOrigin === originOf(appUrl);
}

function installPermissionHandlers({ session, appUrl }) {
  const allow = (permission, requestingUrl) => isPermissionAllowed(permission, requestingUrl, appUrl);

  // Every request is answered explicitly: an unanswered request would fall back
  // to Electron's default, which is what this handler exists to override.
  session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(allow(permission, details?.requestingUrl));
  });

  // The check handler answers the synchronous capability queries the page makes
  // before it asks (Notification.permission, navigator.mediaDevices, ...), so a
  // denied feature is denied without a prompt.
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
    allow(permission, requestingOrigin),
  );
}

module.exports = { isPermissionAllowed, installPermissionHandlers };
