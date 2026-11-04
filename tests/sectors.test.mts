import assert from "node:assert/strict";
import test from "node:test";
import { holdingSector, sectorForSymbol, UNCLASSIFIED_SECTOR } from "../src/lib/sectors.ts";

test("classifies known tickers and index funds", () => {
  assert.equal(sectorForSymbol("AAPL"), "Technology");
  assert.equal(sectorForSymbol("aapl"), "Technology");
  assert.equal(sectorForSymbol("VWRP"), "Global Equity");
  assert.equal(sectorForSymbol("VWRP.L"), "Global Equity");
  assert.equal(sectorForSymbol("ZZZZ"), null);
});

test("an explicit sector wins over the static map", () => {
  assert.equal(holdingSector({ symbol: "AAPL", sector: "Custom sleeve" }), "Custom sleeve");
  assert.equal(holdingSector({ symbol: "AAPL", sector: "   " }), "Technology");
  assert.equal(holdingSector({ symbol: "ZZZZ" }), UNCLASSIFIED_SECTOR);
});
