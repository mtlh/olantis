/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { isSessionCookie, resolveEntryUrl } = require("../electron/entry-url.cjs");

const productionUrl = "https://olantis.vercel.app";

test("signed-out launches still open the landing page", () => {
  assert.equal(resolveEntryUrl(productionUrl, []), productionUrl);
  assert.equal(resolveEntryUrl(productionUrl, [{ name: "unrelated", value: "1" }]), productionUrl);
});

test("a signed-in launch enters the dashboard directly", () => {
  // "/" would render the landing page and only then redirect, so the desktop
  // shell picks the destination from the session cookie instead.
  assert.equal(resolveEntryUrl(productionUrl, [{ name: "wos-session", value: "abc" }]), "https://olantis.vercel.app/dashboard");
  assert.equal(
    resolveEntryUrl(productionUrl, [{ name: "wos-session-1", value: "chunk" }]),
    "https://olantis.vercel.app/dashboard",
  );
  // Demo sessions use their own cookie and land on the same dashboard.
  assert.equal(
    resolveEntryUrl(productionUrl, [{ name: "olantis_demo", value: "demo-id" }]),
    "https://olantis.vercel.app/dashboard",
  );
});

test("every chunk of a large session cookie counts, unrelated cookies do not", () => {
  // AuthKit splits a big JWT into wos-session-0, wos-session-1, ...
  assert.equal(isSessionCookie({ name: "wos-session-0" }), true);
  assert.equal(isSessionCookie({ name: "wos-session-7" }), true);
  assert.equal(isSessionCookie({ name: "not-wos-session" }), false);
  assert.equal(isSessionCookie({ name: "olantis_demo" }), true);
});

test("a configured entry path is never overridden", () => {
  const configured = "https://olantis.vercel.app/settings?tab=accounts";
  assert.equal(resolveEntryUrl(configured, [{ name: "wos-session", value: "abc" }]), configured);
  assert.equal(resolveEntryUrl("http://127.0.0.1:3000/dashboard", [{ name: "wos-session", value: "abc" }]), "http://127.0.0.1:3000/dashboard");
});

test("the local development origin resolves against its own base", () => {
  assert.equal(resolveEntryUrl("http://127.0.0.1:3000", [{ name: "wos-session", value: "abc" }]), "http://127.0.0.1:3000/dashboard");
  assert.equal(resolveEntryUrl("http://127.0.0.1:3000", []), "http://127.0.0.1:3000");
});

test("an unparsable URL falls back to whatever was configured", () => {
  assert.equal(resolveEntryUrl("not a url", [{ name: "wos-session", value: "abc" }]), "not a url");
});
