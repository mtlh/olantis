// GitHub's generated release body is Markdown (sometimes HTML), while the
// sidebar needs a short list of plain lines. Kept free of Electron so the
// release feed can be tested as a pure function.

const MAX_RELEASE_NOTE_ITEMS = 8;
const MAX_RELEASE_NOTE_LENGTH = 180;

const HTML_ENTITY_REPLACEMENTS = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
]);

function decodeHtmlEntity(entity) {
  const named = HTML_ENTITY_REPLACEMENTS.get(entity);
  if (named) return named;
  if (entity.startsWith("#x")) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return Number.isInteger(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  if (entity.startsWith("#")) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return Number.isInteger(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  return `&${entity};`;
}

function decodeHtmlEntities(input) {
  return input.replace(/&([a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/g, (_match, entity) => decodeHtmlEntity(entity));
}

/** GitHub release bodies arrive as Markdown, occasionally wrapped in HTML tags. */
function stripMarkup(input) {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<\/(?:p|div|li|h[1-6]|ul|ol|blockquote)>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  );
}

function cleanReleaseNoteLine(line) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s+by\s+@[\w-]+(?:\s+in\s+https?:\/\/\S+)?$/i, "")
    .replace(/\s*\((?:#\d+(?:,\s*)?)+\)\.?$/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateReleaseNote(item) {
  if (item.length <= MAX_RELEASE_NOTE_LENGTH) return item;
  return `${item.slice(0, MAX_RELEASE_NOTE_LENGTH - 1).trimEnd()}…`;
}

function isIgnoredReleaseNoteLine(line) {
  const normalized = line.toLowerCase();
  return (
    normalized === "" ||
    normalized === "what's changed" ||
    normalized === "whats changed" ||
    normalized.startsWith("full changelog") ||
    normalized.startsWith("compare:") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("http://")
  );
}

function isContributorSection(line) {
  const normalized = line.toLowerCase();
  return normalized === "new contributors" || normalized === "contributors";
}

function releaseNoteEntries(releaseNotes, fallbackVersion) {
  if (Array.isArray(releaseNotes)) {
    return releaseNotes.filter(
      (entry) => typeof entry === "object" && entry !== null && typeof entry.note === "string",
    );
  }
  if (typeof releaseNotes === "string") {
    return [{ version: fallbackVersion, note: releaseNotes }];
  }
  return [];
}

/**
 * Extracts the changelog lines from a release body and de-duplicates them, so
 * they can be used as React keys. Newest first, capped at eight lines.
 */
function parseReleaseNotes(releaseNotes, fallbackVersion) {
  const version = typeof fallbackVersion === "string" ? fallbackVersion : null;
  const entries = releaseNoteEntries(releaseNotes, version);
  const entry = entries.find((candidate) => candidate.version === version) ?? entries[0];
  if (!entry) return { items: [], total: 0 };

  const items = [];
  const seen = new Set();
  let total = 0;
  for (const rawLine of stripMarkup(entry.note).split("\n")) {
    const line = cleanReleaseNoteLine(rawLine);
    if (isContributorSection(line)) break;
    if (isIgnoredReleaseNoteLine(line)) continue;
    total += 1;
    if (items.length >= MAX_RELEASE_NOTE_ITEMS) continue;
    const item = truncateReleaseNote(line);
    if (seen.has(item)) continue;
    seen.add(item);
    items.push(item);
  }

  return { items, total };
}

module.exports = {
  MAX_RELEASE_NOTE_ITEMS,
  parseReleaseNotes,
};
