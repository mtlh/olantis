/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedNavigation, isExternalWebUrl } = require("../electron/url-policy.cjs");

const productionUrl = "https://olantis.vercel.app";

test("desktop navigation stays on Olantis and permits WorkOS sign-in redirects", () => {
  assert.equal(isAllowedNavigation("https://olantis.vercel.app/dashboard", productionUrl), true);
  assert.equal(isAllowedNavigation("https://api.workos.com/user_management/authorize", productionUrl), true);
  assert.equal(isAllowedNavigation("https://authkit.workos.com/sign-in", productionUrl), true);
  assert.equal(isAllowedNavigation("https://sso.company.example/login", productionUrl, "https://api.workos.com/sso"), true);
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
