/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");

const { MAX_FEED_RELEASES, normalizeReleaseFeed } = require("../electron/release-feed.cjs");

const release = (overrides) => ({
  tag_name: "desktop-137-abc",
  name: "Olantis Desktop 137",
  draft: false,
  published_at: "2026-11-23T13:08:32Z",
  html_url: "https://github.com/mtlh/olantis/releases/tag/desktop-137-abc",
  body: "## What's Changed\n* feat: show recent changes by @mtlh in https://github.com/mtlh/olantis/pull/142\n* fix: never restart for an update by @mtlh in https://github.com/mtlh/olantis/pull/141\n\n**Full Changelog**: https://github.com/mtlh/olantis/compare/a...b",
  ...overrides,
});

test("recent changes keep the release timestamp, link and notes", () => {
  const [entry] = normalizeReleaseFeed([release()]);

  assert.equal(entry.version, "desktop-137-abc");
  assert.equal(entry.title, "Olantis Desktop 137");
  assert.equal(entry.publishedAt, "2026-11-23T13:08:32Z");
  assert.equal(entry.url, "https://github.com/mtlh/olantis/releases/tag/desktop-137-abc");
  assert.deepEqual(entry.notes, ["feat: show recent changes", "fix: never restart for an update"]);
});

test("drafts and unusable entries never reach the sidebar", () => {
  const feed = normalizeReleaseFeed([
    release({ draft: true }),
    release({ tag_name: "", name: "", body: "" }),
    release({ tag_name: "desktop-136-def", name: "Olantis Desktop 136" }),
  ]);

  assert.equal(feed.length, 1);
  assert.equal(feed[0].version, "desktop-136-def");
});

test("a release without notes still keeps its timestamp and link", () => {
  const [entry] = normalizeReleaseFeed([release({ body: "" })]);

  assert.deepEqual(entry.notes, []);
  assert.equal(entry.publishedAt, "2026-11-23T13:08:32Z");
  assert.equal(entry.url, "https://github.com/mtlh/olantis/releases/tag/desktop-137-abc");
});

test("the feed is capped so the popover stays readable", () => {
  const payload = Array.from({ length: MAX_FEED_RELEASES + 4 }, (_, index) =>
    release({ tag_name: `desktop-${130 + index}`, published_at: `2026-11-${10 + index}T09:00:00Z` }),
  );

  assert.equal(normalizeReleaseFeed(payload).length, MAX_FEED_RELEASES);
  assert.equal(normalizeReleaseFeed(payload, 2).length, 2);
  assert.deepEqual(normalizeReleaseFeed(null), [], "a malformed payload is not a feed");
});
