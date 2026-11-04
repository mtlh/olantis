import assert from "node:assert/strict";
import test from "node:test";
import {
  brandIconSrc,
  holdingLogoSources,
  isCashSymbol,
  issuerBrandForHolding,
  monogramFor,
  normalizeBrandName,
  providerBrandForName,
  providerLogoSources,
  PROVIDER_BRANDS,
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

test("matches Dodl and AJ Bell, preferring Dodl for its co-branded name", () => {
  assert.equal(providerBrandForName("DODL")?.label, "Dodl");
  assert.equal(providerBrandForName("Dodl")?.label, "Dodl");
  assert.equal(providerBrandForName("Dodl by AJ Bell")?.label, "Dodl");
  assert.equal(providerBrandForName("AJBELL")?.label, "AJ Bell");
  assert.equal(providerBrandForName("AJ Bell Youinvest")?.label, "AJ Bell");
});

test("builds the provider picker from broker brands only", () => {
  const labels = PROVIDER_BRANDS.map((brand) => brand.label);
  assert.ok(labels.includes("Vanguard"));
  assert.ok(labels.includes("Trading 212"));
  assert.ok(labels.includes("Hargreaves Lansdown"));
  // Fund issuers are not places to hold a portfolio.
  assert.equal(labels.includes("iShares"), false);
  assert.equal(labels.includes("SPDR"), false);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, "en-GB")));
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

test("uses the authored issuer marks for iShares, J.P. Morgan and State Street", () => {
  const ishares = holdingLogoSources({ symbol: "SWDA.L", name: "iShares Core MSCI World UCITS ETF", exchange: "LSE" });
  assert.equal(ishares[0].src, "https://a.storyblok.com/f/41481/640x640/f4f2d280db/ishares-new.png");
  assert.equal(ishares[0].allowWideMark, true);

  const jpm = holdingLogoSources({ symbol: "JEPG.L", name: "JPMorgan Global Equity Premium Income UCITS ETF", exchange: "LSE" });
  assert.equal(jpm[0].src, "https://companieslogo.com/img/orig/jpmorgan-etf_BIG-577a54cd.png?t=1720244494");
  assert.equal(jpm[0].allowWideMark, true);

  const spdr = holdingLogoSources({
    symbol: "ACWI.L",
    name: "State Street SPDR MSCI All Country World UCITS ETF",
    exchange: "LSE",
  });
  assert.equal(spdr[0].src, "https://www.statestreet.com/content/dam/stt/stt-2.png");
  assert.equal(spdr[0].allowWideMark, true);
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
  // Funds fall back to their issuer's mark, not a ticker stub.
  assert.equal(monogramFor({ symbol: "SPXL", name: "State Street SPDR S&P 500 UCITS ETF" }), "SP");
  assert.equal(monogramFor({ symbol: "IDGA", name: "iShares $ Treasury Bond 0-1yr UCITS ETF" }), "iS");
});

test("cash never resolves to a ticker logo", () => {
  assert.equal(isCashSymbol("CASH"), true);
  assert.equal(isCashSymbol(" cash "), true);
  assert.equal(isCashSymbol("CASHX"), false);
  assert.equal(isCashSymbol(null), false);
  assert.deepEqual(holdingLogoSources({ symbol: "CASH", name: "Cash", exchange: "" }), []);
  assert.equal(brandIconSrc({ symbol: "CASH", name: "Cash" }), null);
});

test("builds same-origin icon URLs for the processing route", () => {
  assert.equal(brandIconSrc({ provider: "Vanguard" }), "/api/brand-icon?provider=Vanguard&v=7");
  assert.equal(brandIconSrc({ provider: "Trading 212" }), "/brands/trading212.svg");
  assert.equal(
    brandIconSrc({ symbol: "VUSA", exchange: "LSE", name: "Vanguard S&P 500" }),
    "/api/brand-icon?symbol=VUSA&exchange=LSE&name=Vanguard+S%26P+500&v=7",
  );
  assert.equal(brandIconSrc({}), null);
});
