import assert from "node:assert/strict";
import test from "node:test";
import {
  brandIconSrc,
  holdingLogoSources,
  issuerBrandForHolding,
  monogramFor,
  normalizeBrandName,
  providerBrandForName,
  providerLogoSources,
  tickerCandidates,
} from "../src/lib/brands.ts";

test("normalises provider names for alias matching", () => {
  assert.equal(normalizeBrandName("M&G"), "m and g");
  assert.equal(normalizeBrandName("  Trading   212 "), "trading 212");
  assert.equal(normalizeBrandName("Hargreaves Lansdown plc"), "hargreaves lansdown plc");
});

test("matches common brokers and platforms", () => {
  assert.equal(providerBrandForName("Vanguard")?.label, "Vanguard");
  assert.equal(providerBrandForName("Trading 212")?.label, "Trading 212");
  assert.equal(providerBrandForName("Hargreaves Lansdown")?.label, "Hargreaves Lansdown");
  assert.equal(providerBrandForName("iShares")?.label, "iShares");
  assert.equal(providerBrandForName("My local broker"), null);
});

test("prefers the crisp local mark for Trading 212", () => {
  assert.equal(providerLogoSources("Trading 212")[0].src, "/brands/trading212.svg");
});

test("matches ETF issuers only for fund-like holding names", () => {
  assert.equal(issuerBrandForHolding("Vanguard FTSE All-World")?.label, "Vanguard");
  assert.equal(issuerBrandForHolding("Invesco EQQQ Nasdaq 100")?.label, "Invesco");
  assert.equal(issuerBrandForHolding("iShares Core MSCI World")?.label, "iShares");
  // A company whose name happens to contain an issuer's name must stay a stock.
  assert.equal(issuerBrandForHolding("Fidelity National Information Services"), null);
  assert.equal(issuerBrandForHolding("Apple Inc"), null);
});

test("puts the issuer mark first for an ETF", () => {
  const sources = holdingLogoSources({ symbol: "VWRP", name: "Vanguard FTSE All-World", exchange: "LSE" });
  assert.match(sources[0].src, /vanguard\.com\/apple-touch-icon\.png/);
  assert.ok(sources.some((source) => source.src.includes("/symbol/VWRP.L?")));
});

test("prefers the company ticker for a single stock", () => {
  const sources = holdingLogoSources({ symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" });
  assert.match(sources[0].src, /companiesmarketcap\.com\/img\/company-logos\/128\/AAPL\.png/);
  assert.ok(sources.some((source) => source.src.includes("assets.parqet.com/logos/symbol/AAPL?")));
  assert.ok(sources.some((source) => source.src.includes("financialmodelingprep.com/image-stock/AAPL.png")));
});

test("applies the exchange suffix expected by the logo services", () => {
  assert.deepEqual(tickerCandidates("VUSA", "LSE"), ["VUSA.L"]);
  assert.deepEqual(tickerCandidates("VUSA.L", "LSE"), ["VUSA.L"]);
  assert.deepEqual(tickerCandidates("VUSA.LON", "LSE"), ["VUSA.L"]);
  assert.deepEqual(tickerCandidates("AAPL", "NASDAQ"), ["AAPL"]);
  assert.deepEqual(tickerCandidates("AAPL", ""), ["AAPL"]);
});

test("falls back to a monogram for unknown names", () => {
  assert.deepEqual(providerLogoSources("My local broker"), []);
  assert.equal(monogramFor({ provider: "My local broker" }), "ML");
  assert.equal(monogramFor({ provider: "Hargreaves Lansdown" }), "HL");
  assert.equal(monogramFor({ symbol: "AAPL" }), "AAP");
});

test("builds same-origin icon URLs for the processing route", () => {
  assert.equal(brandIconSrc({ provider: "Vanguard" }), "/api/brand-icon?provider=Vanguard&v=4");
  assert.equal(brandIconSrc({ provider: "Trading 212" }), "/brands/trading212.svg");
  assert.equal(
    brandIconSrc({ symbol: "VUSA", exchange: "LSE", name: "Vanguard S&P 500" }),
    "/api/brand-icon?symbol=VUSA&exchange=LSE&name=Vanguard+S%26P+500&v=4",
  );
  assert.equal(brandIconSrc({}), null);
});
