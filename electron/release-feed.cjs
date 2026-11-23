/* eslint-disable @typescript-eslint/no-require-imports */
// The recent-changes feed behind the sidebar's refresh control. The desktop
// shell is a window onto the deployed site, so a site change needs no installer;
// this only reads what shipped recently from the public GitHub releases.
//
// Kept free of Electron so the payload can be normalised and tested directly.

const { parseReleaseNotes } = require("./release-notes.cjs");

const RELEASES_API_URL = "https://api.github.com/repos/mtlh/olantis/releases?per_page=10";
// Enough to show a couple of days of desktop releases in the popover without
// turning the panel into a scrolling changelog archive.
const MAX_FEED_RELEASES = 6;

function readString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * GitHub returns the newest release first. Drafts are not published yet, so
 * they must never appear; everything else becomes one entry with the notes the
 * release page already shows.
 */
function normalizeReleaseFeed(payload, limit = MAX_FEED_RELEASES) {
  if (!Array.isArray(payload)) return [];
  const cap = Number.isInteger(limit) && limit > 0 ? limit : MAX_FEED_RELEASES;
  const releases = [];
  for (const candidate of payload) {
    if (typeof candidate !== "object" || candidate === null || candidate.draft === true) continue;
    const version = readString(candidate.tag_name);
    const publishedAt = readString(candidate.published_at);
    const notes = parseReleaseNotes(readString(candidate.body), version).items;
    if (!version && notes.length === 0) continue;
    releases.push({
      version,
      title: readString(candidate.name) ?? version,
      publishedAt,
      url: readString(candidate.html_url),
      notes,
    });
    if (releases.length >= cap) break;
  }
  return releases;
}

module.exports = {
  MAX_FEED_RELEASES,
  RELEASES_API_URL,
  normalizeReleaseFeed,
};
