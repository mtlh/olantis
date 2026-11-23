import assert from "node:assert/strict";
import test from "node:test";
import { createSearchQuery, matchesSearch, normalizeSearchText } from "../src/lib/search.ts";

const matches = (query: string, ...fields: ReadonlyArray<string | null | undefined>) =>
  matchesSearch(createSearchQuery(query), ...fields);

test("normalises case, accents and punctuation", () => {
  assert.equal(normalizeSearchText("  Vanguard S&P 500  "), "vanguard s and p 500");
  assert.equal(normalizeSearchText("Café"), "cafe");
});

test("an empty query matches anything", () => {
  assert.equal(matches("", "VWRP"), true);
  assert.equal(matches("   "), true);
});

test("matches symbols and names case-insensitively", () => {
  assert.equal(matches("vwrp", "VWRP", "Vanguard FTSE All-World"), true);
  assert.equal(matches("all-world", "VWRP", "Vanguard FTSE All-World"), true);
});

test("requires every token to match somewhere", () => {
  assert.equal(matches("vanguard 500", "VWRP", "Vanguard S&P 500"), true);
  assert.equal(matches("vanguard 600", "VWRP", "Vanguard S&P 500"), false);
});

test("tolerates a single typo in longer tokens", () => {
  assert.equal(matches("vwrr", "VWRP", "Vanguard FTSE All-World"), true);
  assert.equal(matches("vangard 500", "VWRP", "Vanguard S&P 500"), true);
});

test("keeps short tokens strict", () => {
  assert.equal(matches("vwr", "VWRP"), true);
  assert.equal(matches("vwp", "VWRP"), false);
});

test("ignores empty fields", () => {
  assert.equal(matches("vwrp", null, undefined, ""), false);
  assert.equal(matches("vwrp", null, "VWRP"), true);
});
