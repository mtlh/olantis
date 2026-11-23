/**
 * Shared text search for workspace lists (sidebar tree, holdings table and
 * pickers).
 *
 * A query is split into tokens and every token must match at least one of the
 * supplied fields. Matching ignores case, punctuation and accents and tolerates
 * one typo in longer tokens, so "vwrr" still finds VWRP and "vangard 500"
 * finds "Vanguard S&P 500".
 */

export type SearchQuery = { readonly tokens: readonly string[] };

/** Tokens shorter than this only match substrings, to keep noise down. */
const FUZZY_MIN_LENGTH = 4;

/** Lowercase, strip accents and punctuation, and collapse whitespace. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Prepare a raw input value once, then reuse it for every row. */
export function createSearchQuery(query: string): SearchQuery {
  const normalized = normalizeSearchText(query);
  return { tokens: normalized ? normalized.split(" ") : [] };
}

/** True when the strings differ by at most one insertion, deletion or replacement. */
function withinOneEdit(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.length - shorter.length > 1) return false;
  let shortIndex = 0;
  let longIndex = 0;
  let edits = 0;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (shorter.length === longer.length) shortIndex += 1;
    longIndex += 1;
  }
  return edits + (longer.length - longIndex) <= 1;
}

function fieldMatchesToken(field: string, token: string): boolean {
  if (!field) return false;
  if (field.includes(token)) return true;
  if (token.length < FUZZY_MIN_LENGTH) return false;
  return field
    .split(" ")
    .some((word) => word.length >= 3 && withinOneEdit(word, token));
}

/**
 * True when every token matches at least one field. An empty query matches
 * everything, so callers can filter unconditionally.
 */
export function matchesSearch(
  query: SearchQuery,
  ...fields: ReadonlyArray<string | null | undefined>
): boolean {
  if (!query.tokens.length) return true;
  const normalizedFields = fields
    .filter((field): field is string => Boolean(field))
    .map(normalizeSearchText)
    .filter(Boolean);
  if (!normalizedFields.length) return false;
  return query.tokens.every((token) => normalizedFields.some((field) => fieldMatchesToken(field, token)));
}
