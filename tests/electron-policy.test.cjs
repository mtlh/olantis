/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedNavigation, isExternalWebUrl, isSafeExternalUrl } = require("../electron/url-policy.cjs");
const { isPermissionAllowed, installPermissionHandlers } = require("../electron/permissions.cjs");

const productionUrl = "https://olantis.vercel.app";

test("desktop navigation stays on Olantis and permits WorkOS sign-in redirects", () => {
  assert.equal(isAllowedNavigation("https://olantis.vercel.app/dashboard", productionUrl), true);
  assert.equal(isAllowedNavigation("https://api.workos.com/user_management/authorize", productionUrl), true);
  assert.equal(isAllowedNavigation("https://authkit.workos.com/sign-in", productionUrl), true);
  assert.equal(isAllowedNavigation("https://sso.company.example/login", productionUrl, "https://api.workos.com/sso"), true);
});

test("identity providers sign in inside the app window", () => {
  const googleSignIn = "https://accounts.google.com/v3/signin/identifier?client_id=abc";
  assert.equal(isAllowedNavigation(googleSignIn, productionUrl, "https://spirited-turf-10-staging.authkit.app/"), true);
  // The provider's own form posts and checkpoints must not be handed to a
  // browser that has none of this flow's session cookies.
  assert.equal(isAllowedNavigation("https://accounts.google.com/v3/signin/challenge", productionUrl, googleSignIn), true);
  assert.equal(isAllowedNavigation("https://auth.workos.com/sso/oauth/google/callback", productionUrl, googleSignIn), true);
  assert.equal(isAllowedNavigation("https://olantis.vercel.app/callback?code=abc&state=def", productionUrl, googleSignIn), true);
  assert.equal(
    isAllowedNavigation("https://login.microsoftonline.com/common/oauth2/v2.0/authorize", productionUrl, "https://spirited-turf-10-staging.authkit.app/"),
    true,
  );
  assert.equal(isAllowedNavigation("https://github.com/login/oauth/authorize", productionUrl, "https://spirited-turf-10-staging.authkit.app/"), true);
});

test("identity provider trust stays scoped to the sign-in chain", () => {
  assert.equal(isAllowedNavigation("https://accounts.google.com/v3/signin/identifier", productionUrl), true);
  assert.equal(isAllowedNavigation("https://github.com/login/oauth/authorize", productionUrl), true);
  // Ordinary GitHub pages still open in the system browser.
  assert.equal(isAllowedNavigation("https://github.com/mtlh/olantis", productionUrl), false);
  assert.equal(isAllowedNavigation("https://example.com/pricing", productionUrl), false);
  // Provider hops while a sign-in is in flight stay in the app window, since
  // handing them to a browser would drop the flow's cookies on the floor.
  assert.equal(isAllowedNavigation("https://idmsa.apple.com/IDMSWebAuth/signin", productionUrl, "https://appleid.apple.com/"), true);
  assert.equal(isAllowedNavigation("http://accounts.google.com/v3/signin/identifier", productionUrl), false);
});

test("desktop navigation rejects insecure and lookalike origins", () => {
  assert.equal(isAllowedNavigation("http://olantis.vercel.app/dashboard", productionUrl), false);
  assert.equal(isAllowedNavigation("https://olantis.vercel.app.attacker.test/", productionUrl), false);
  assert.equal(isAllowedNavigation("https://workos.com.attacker.test/", productionUrl), false);
  assert.equal(isAllowedNavigation("https://sso.company.example/login", productionUrl, productionUrl), false);
  assert.equal(isAllowedNavigation("javascript:alert(1)", productionUrl), false);
});

test("the local Electron development origin is allowed", () => {
  assert.equal(isAllowedNavigation("http://127.0.0.1:3000/dashboard", "http://127.0.0.1:3000"), true);
  assert.equal(isAllowedNavigation("http://127.0.0.1:3001/dashboard", "http://127.0.0.1:3000"), false);
});

test("only web links can be opened in the system browser", () => {
  assert.equal(isExternalWebUrl("https://example.com"), true);
  assert.equal(isExternalWebUrl("http://example.com"), true);
  assert.equal(isExternalWebUrl("file:///etc/passwd"), false);
  assert.equal(isExternalWebUrl("javascript:alert(1)"), false);
});

test("external links may be web pages or mail drafts with an address", () => {
  assert.equal(isSafeExternalUrl("https://example.com/pricing"), true);
  assert.equal(isSafeExternalUrl("http://example.com"), true);
  assert.equal(isSafeExternalUrl("mailto:hi@example.com"), true);
  // An empty mail draft is not a link, and no other scheme reaches the OS.
  assert.equal(isSafeExternalUrl("mailto:"), false);
  assert.equal(isSafeExternalUrl("mailto:?subject=Olantis"), false);
  assert.equal(isSafeExternalUrl("tel:+15551234567"), false);
  assert.equal(isSafeExternalUrl("file:///etc/passwd"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
});

test("notifications are granted only to the app's own origin", () => {
  assert.equal(isPermissionAllowed("notifications", "https://olantis.vercel.app/dashboard", productionUrl), true);
  // A provider page in the sign-in chain shares this session with the app.
  assert.equal(isPermissionAllowed("notifications", "https://accounts.google.com/v3/signin", productionUrl), false);
  assert.equal(isPermissionAllowed("camera", "https://olantis.vercel.app/dashboard", productionUrl), false);
  assert.equal(isPermissionAllowed("clipboard-read", "https://olantis.vercel.app/dashboard", productionUrl), false);
  assert.equal(isPermissionAllowed("notifications", "not a url", productionUrl), false);
  assert.equal(isPermissionAllowed("notifications", undefined, productionUrl), false);
});

test("permission handlers deny by default and answer the capability query", () => {
  const handlers = {};
  const fakeSession = {
    setPermissionRequestHandler: (handler) => {
      handlers.request = handler;
    },
    setPermissionCheckHandler: (handler) => {
      handlers.check = handler;
    },
  };

  installPermissionHandlers({ session: fakeSession, appUrl: productionUrl });
  assert.equal(typeof handlers.request, "function");
  assert.equal(typeof handlers.check, "function");

  const decisions = [];
  handlers.request({}, "notifications", (granted) => decisions.push(granted), { requestingUrl: productionUrl });
  handlers.request({}, "camera", (granted) => decisions.push(granted), { requestingUrl: productionUrl });
  assert.deepEqual(decisions, [true, false]);

  assert.equal(handlers.check({}, "notifications", productionUrl), true);
  assert.equal(handlers.check({}, "microphone", productionUrl), false);
  assert.equal(handlers.check({}, "notifications", "https://example.com"), false);
});
