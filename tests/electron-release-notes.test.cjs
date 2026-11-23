/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");

const { parseReleaseNotes } = require("../electron/release-notes.cjs");

const generatedNotes = `## What's Changed
* feat: show update changelog before relaunching by @mtlh in https://github.com/mtlh/olantis/pull/131
* fix: keep sidebar selections instant by @mtlh in https://github.com/mtlh/olantis/pull/129
* chore: upgrade all dependencies to latest by @mtlh in https://github.com/mtlh/olantis/pull/130

## New Contributors
* @someone made their first contribution in https://github.com/mtlh/olantis/pull/120

**Full Changelog**: https://github.com/mtlh/olantis/compare/desktop-1...desktop-2
`;

test("release notes become the commits an update would install", () => {
  const parsed = parseReleaseNotes(generatedNotes, "0.1.42");

  assert.deepEqual(parsed.items, [
    "feat: show update changelog before relaunching",
    "fix: keep sidebar selections instant",
    "chore: upgrade all dependencies to latest",
  ]);
  assert.equal(parsed.total, 3);
});

test("release notes survive HTML, entities and numbered lists", () => {
  const parsed = parseReleaseNotes(
    "<p>1. Add <strong>budget</strong> goals &amp; alerts</p><ul><li>Fix &quot;empty&quot; charts</li></ul>",
    "0.2.0",
  );

  assert.deepEqual(parsed.items, ["Add budget goals & alerts", "Fix \"empty\" charts"]);
});

test("the notes for the offered version win over other feeds", () => {
  const parsed = parseReleaseNotes(
    [
      { version: "0.1.40", note: "* older change by @mtlh in https://example.test/1" },
      { version: "0.1.42", note: "* feat: the new one by @mtlh in https://example.test/2" },
    ],
    "0.1.42",
  );

  assert.deepEqual(parsed.items, ["feat: the new one"]);
});

test("notes are capped, de-duplicated and shortened for the sidebar", () => {
  const longLine = `* ${"a very long changelog entry ".repeat(20)} by @mtlh in https://example.test/1`;
  const parsed = parseReleaseNotes(
    ["* same change by @mtlh in https://example.test/1", "* same change by @mtlh in https://example.test/2", longLine, ...Array.from({ length: 10 }, (_, index) => `* change ${index}`)].join("\n"),
    "0.1.42",
  );

  assert.equal(parsed.items[0], "same change");
  assert.equal(parsed.items[1].endsWith("…"), true);
  assert.equal(parsed.items.length, 8);
  assert.equal(new Set(parsed.items).size, parsed.items.length);
  assert.equal(parsed.total, 13);
});

test("no notes leaves the release link as the only changelog", () => {
  assert.deepEqual(parseReleaseNotes(undefined, "0.1.42").items, []);
  assert.deepEqual(parseReleaseNotes(null, "0.1.42").items, []);
});
