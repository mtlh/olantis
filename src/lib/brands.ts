/**
 * Brand marks for providers (brokers / platforms) and fund issuers.
 *
 * We deliberately do not ship raster brand assets: marks are fetched from the
 * public favicon service, with the brand's domain as the lookup key. That keeps
 * the bundle small and means new providers work as soon as their domain is
 * listed here. Every caller must still handle a missing mark — the UI falls
 * back to a monogram tile.
 */

export type BrandKind = "provider" | "issuer" | "both";

export type Brand = {
  key: string;
  label: string;
  kind: BrandKind;
  aliases: string[];
  /** Domain whose favicon best represents the brand. */
  domain: string;
  /** Used when the favicon cannot be fetched. */
  monogram: string;
  /**
   * Higher-resolution marks (usually the site's apple-touch-icon). Tried
   * before the favicon so crisp artwork wins over a 32px icon.
   */
  iconUrls?: string[];
  /** Tint for monochrome marks, e.g. Vanguard's white V on its red tile. */
  markColor?: string;
};

const FAVICON_BASE = "https://www.google.com/s2/favicons";
const PARQET_BASE = "https://assets.parqet.com/logos/symbol";
const FMP_BASE = "https://financialmodelingprep.com/image-stock";
const CMC_BASE = "https://companiesmarketcap.com/img/company-logos/128";

/** Bump when the icon renderer changes so browsers drop cached marks. */
export const BRAND_ICON_VERSION = "6";

/**
 * A holding whose symbol is CASH is not a listed security — it is the user's
 * uninvested balance, so it must never resolve to a company that happens to
 * own the CASH ticker.
 */
export function isCashSymbol(symbol: string | null | undefined): boolean {
  return !!symbol && /^cash$/i.test(symbol.trim());
}

/**
 * Word order matters for aliases: they are matched as whole words against the
 * normalised name, and the longest matching alias wins. Keep short aliases
 * (e.g. "hl", "ii", "lg") out — they collide with ordinary words.
 */
const BRANDS: Brand[] = [
  // Brokers, platforms and banks -------------------------------------------------
  { key: "vanguard", label: "Vanguard", kind: "both", aliases: ["vanguard", "vanguard investor", "vanguard asset management"], domain: "vanguard.com", monogram: "V", iconUrls: ["https://www.vanguard.com/apple-touch-icon.png"], markColor: "#96151d" },
  { key: "invesco", label: "Invesco", kind: "both", aliases: ["invesco"], domain: "invesco.com", monogram: "IVZ", iconUrls: ["https://www.invesco.com/etc.clientlibs/invesco/clientlibs/main/resources/images/apple-touch-icon.png"] },
  { key: "ishares", label: "iShares", kind: "issuer", aliases: ["ishares", "i shares"], domain: "ishares.com", monogram: "iS" },
  { key: "blackrock", label: "BlackRock", kind: "both", aliases: ["blackrock", "black rock"], domain: "blackrock.com", monogram: "BLK" },
  { key: "spdr", label: "SPDR", kind: "issuer", aliases: ["spdr", "state street", "ssga"], domain: "ssga.com", monogram: "SP", iconUrls: ["https://www.ssga.com/apple-touch-icon.png"] },
  { key: "trading212", label: "Trading 212", kind: "provider", aliases: ["trading 212", "trading212"], domain: "trading212.com", monogram: "T212", iconUrls: ["/brands/trading212.svg", "https://www.trading212.com/apple-touch-icon.png"] },
  { key: "hargreaves", label: "Hargreaves Lansdown", kind: "provider", aliases: ["hargreaves lansdown", "hargreaves"], domain: "hl.co.uk", monogram: "HL" },
  { key: "ajbell", label: "AJ Bell", kind: "provider", aliases: ["aj bell", "ajbell", "aj bell youinvest", "youinvest"], domain: "ajbell.co.uk", monogram: "AJB", iconUrls: ["https://www.ajbell.co.uk/apple-touch-icon.png"], markColor: "#d6003c" },
  { key: "dodl", label: "Dodl", kind: "provider", aliases: ["dodl by aj bell", "dodl"], domain: "dodl.co.uk", monogram: "D", iconUrls: ["https://www.dodl.co.uk/apple-touch-icon.png"] },
  { key: "interactiveinvestor", label: "Interactive Investor", kind: "provider", aliases: ["interactive investor"], domain: "ii.co.uk", monogram: "II" },
  { key: "fidelity", label: "Fidelity", kind: "both", aliases: ["fidelity", "fidelity international"], domain: "fidelity.co.uk", monogram: "F" },
  { key: "nutmeg", label: "Nutmeg", kind: "provider", aliases: ["nutmeg"], domain: "nutmeg.com", monogram: "N" },
  { key: "moneybox", label: "Moneybox", kind: "provider", aliases: ["moneybox"], domain: "moneyboxapp.com", monogram: "MB" },
  { key: "investengine", label: "InvestEngine", kind: "provider", aliases: ["investengine", "invest engine"], domain: "investengine.com", monogram: "IE" },
  { key: "freetrade", label: "Freetrade", kind: "provider", aliases: ["freetrade", "free trade"], domain: "freetrade.io", monogram: "FT" },
  { key: "etoro", label: "eToro", kind: "provider", aliases: ["etoro", "e toro"], domain: "etoro.com", monogram: "eT" },
  { key: "ibkr", label: "Interactive Brokers", kind: "provider", aliases: ["interactive brokers", "ibkr"], domain: "interactivebrokers.com", monogram: "IB", iconUrls: ["https://www.interactivebrokers.com/apple-touch-icon.png"] },
  { key: "schwab", label: "Charles Schwab", kind: "provider", aliases: ["charles schwab", "schwab"], domain: "schwab.com", monogram: "CS" },
  { key: "robinhood", label: "Robinhood", kind: "provider", aliases: ["robinhood"], domain: "robinhood.com", monogram: "RH" },
  { key: "webull", label: "Webull", kind: "provider", aliases: ["webull"], domain: "webull.com", monogram: "WB" },
  { key: "revolut", label: "Revolut", kind: "provider", aliases: ["revolut"], domain: "revolut.com", monogram: "R" },
  { key: "monzo", label: "Monzo", kind: "provider", aliases: ["monzo"], domain: "monzo.com", monogram: "M" },
  { key: "starling", label: "Starling", kind: "provider", aliases: ["starling bank", "starling"], domain: "starlingbank.com", monogram: "S", iconUrls: ["https://www.starlingbank.com/apple-touch-icon.png"] },
  { key: "wise", label: "Wise", kind: "provider", aliases: ["wise"], domain: "wise.com", monogram: "W" },
  { key: "hsbc", label: "HSBC", kind: "both", aliases: ["hsbc"], domain: "hsbc.com", monogram: "HSBC", iconUrls: ["https://www.hsbc.com/apple-touch-icon.png"] },
  { key: "barclays", label: "Barclays", kind: "provider", aliases: ["barclays"], domain: "barclays.co.uk", monogram: "B", iconUrls: ["https://www.barclays.co.uk/apple-touch-icon.png"] },
  { key: "lloyds", label: "Lloyds", kind: "provider", aliases: ["lloyds bank", "lloyds"], domain: "lloydsbank.com", monogram: "L", iconUrls: ["https://www.lloydsbank.com/apple-touch-icon.png"] },
  { key: "natwest", label: "NatWest", kind: "provider", aliases: ["natwest"], domain: "natwest.com", monogram: "NW" },
  { key: "santander", label: "Santander", kind: "provider", aliases: ["santander"], domain: "santander.co.uk", monogram: "S" },
  { key: "halifax", label: "Halifax", kind: "provider", aliases: ["halifax"], domain: "halifax.co.uk", monogram: "H" },
  { key: "nationwide", label: "Nationwide", kind: "provider", aliases: ["nationwide"], domain: "nationwide.co.uk", monogram: "N" },
  { key: "firstdirect", label: "first direct", kind: "provider", aliases: ["first direct"], domain: "firstdirect.com", monogram: "fd" },
  { key: "tsb", label: "TSB", kind: "provider", aliases: ["tsb bank", "tsb"], domain: "tsb.co.uk", monogram: "TSB" },
  { key: "virginmoney", label: "Virgin Money", kind: "provider", aliases: ["virgin money"], domain: "virginmoney.com", monogram: "VM" },
  { key: "plum", label: "Plum", kind: "provider", aliases: ["plum"], domain: "withplum.com", monogram: "P" },
  { key: "wealthify", label: "Wealthify", kind: "provider", aliases: ["wealthify"], domain: "wealthify.com", monogram: "W" },
  { key: "moneyfarm", label: "Moneyfarm", kind: "provider", aliases: ["moneyfarm"], domain: "moneyfarm.com", monogram: "MF" },
  { key: "pensionbee", label: "PensionBee", kind: "provider", aliases: ["pensionbee", "pension bee"], domain: "pensionbee.com", monogram: "PB", iconUrls: ["https://www.pensionbee.com/apple-touch-icon.png"] },
  { key: "aviva", label: "Aviva", kind: "both", aliases: ["aviva", "aviva investors"], domain: "aviva.co.uk", monogram: "A", iconUrls: ["https://www.aviva.co.uk/apple-touch-icon.png"] },
  { key: "standardlife", label: "Standard Life", kind: "provider", aliases: ["standard life"], domain: "standardlife.co.uk", monogram: "SL" },
  { key: "scottishwidows", label: "Scottish Widows", kind: "provider", aliases: ["scottish widows"], domain: "scottishwidows.co.uk", monogram: "SW" },
  { key: "royallondon", label: "Royal London", kind: "both", aliases: ["royal london"], domain: "royallondon.com", monogram: "RL" },
  { key: "abrdn", label: "abrdn", kind: "both", aliases: ["abrdn", "aberdeen standard"], domain: "abrdn.com", monogram: "a" },
  { key: "mandg", label: "M&G", kind: "both", aliases: ["m and g", "m&g"], domain: "mandg.com", monogram: "M&G" },
  { key: "schroders", label: "Schroders", kind: "both", aliases: ["schroders", "schroder"], domain: "schroders.com", monogram: "S" },
  { key: "bailliegifford", label: "Baillie Gifford", kind: "both", aliases: ["baillie gifford", "bailie gifford"], domain: "bailiegifford.com", monogram: "BG" },
  { key: "janushenderson", label: "Janus Henderson", kind: "both", aliases: ["janus henderson"], domain: "janushenderson.com", monogram: "JH" },
  { key: "polarcapital", label: "Polar Capital", kind: "both", aliases: ["polar capital"], domain: "polarcapital.com", monogram: "PC" },
  { key: "swissquote", label: "Swissquote", kind: "provider", aliases: ["swissquote"], domain: "swissquote.com", monogram: "SQ" },
  { key: "saxo", label: "Saxo Bank", kind: "provider", aliases: ["saxo bank", "saxo"], domain: "home.saxo", monogram: "SX", iconUrls: ["https://home.saxo/apple-touch-icon.png"] },
  { key: "degiro", label: "DEGIRO", kind: "provider", aliases: ["degiro"], domain: "degiro.com", monogram: "D" },
  { key: "scalable", label: "Scalable Capital", kind: "provider", aliases: ["scalable capital", "scalable"], domain: "scalable.capital", monogram: "SC" },
  { key: "traderepublic", label: "Trade Republic", kind: "provider", aliases: ["trade republic"], domain: "traderepublic.com", monogram: "TR" },
  { key: "lightyear", label: "Lightyear", kind: "provider", aliases: ["lightyear"], domain: "lightyear.com", monogram: "LY" },
  { key: "stake", label: "Stake", kind: "provider", aliases: ["stake"], domain: "getstake.com", monogram: "S" },
  { key: "sharesies", label: "Sharesies", kind: "provider", aliases: ["sharesies"], domain: "sharesies.com", monogram: "SH", iconUrls: ["https://www.sharesies.com/apple-touch-icon.png"] },

  // ETF / fund issuers -----------------------------------------------------------
  { key: "amundi", label: "Amundi", kind: "issuer", aliases: ["amundi"], domain: "amundi.com", monogram: "Am" },
  { key: "lyxor", label: "Lyxor", kind: "issuer", aliases: ["lyxor"], domain: "lyxor.com", monogram: "LX" },
  { key: "xtrackers", label: "Xtrackers", kind: "issuer", aliases: ["xtrackers", "x trackers", "dws"], domain: "xtrackers.com", monogram: "X" },
  { key: "jpmorgan", label: "J.P. Morgan", kind: "both", aliases: ["jpmorgan", "j p morgan", "jp morgan", "jpm"], domain: "jpmorgan.com", monogram: "JPM" },
  { key: "wisdomtree", label: "WisdomTree", kind: "issuer", aliases: ["wisdomtree", "wisdom tree"], domain: "wisdomtree.com", monogram: "WT" },
  { key: "vaneck", label: "VanEck", kind: "issuer", aliases: ["vaneck", "van eck"], domain: "vaneck.com", monogram: "VE" },
  { key: "legalgeneral", label: "Legal & General", kind: "both", aliases: ["legal and general", "legal general", "lgim"], domain: "legalandgeneral.com", monogram: "L&G" },
  { key: "ubs", label: "UBS", kind: "both", aliases: ["ubs"], domain: "ubs.com", monogram: "UBS" },
  { key: "bnpparibas", label: "BNP Paribas", kind: "both", aliases: ["bnp paribas"], domain: "bnpparibas.com", monogram: "BNP" },
  { key: "globalx", label: "Global X", kind: "issuer", aliases: ["global x"], domain: "globalxetfs.com", monogram: "GX" },
  { key: "ark", label: "ARK Invest", kind: "issuer", aliases: ["ark invest", "ark"], domain: "ark-funds.com", monogram: "ARK" },
  { key: "franklin", label: "Franklin Templeton", kind: "issuer", aliases: ["franklin templeton", "franklin"], domain: "franklintempleton.com", monogram: "FT" },
  { key: "morganstanley", label: "Morgan Stanley", kind: "issuer", aliases: ["morgan stanley"], domain: "morganstanley.com", monogram: "MS" },
  { key: "firsttrust", label: "First Trust", kind: "issuer", aliases: ["first trust"], domain: "ftportfolios.com", monogram: "FT" },
  { key: "proshares", label: "ProShares", kind: "issuer", aliases: ["proshares", "pro shares"], domain: "proshares.com", monogram: "PS" },
  { key: "pictet", label: "Pictet", kind: "issuer", aliases: ["pictet"], domain: "pictet.com", monogram: "P" },
  { key: "robeco", label: "Robeco", kind: "issuer", aliases: ["robeco"], domain: "robeco.com", monogram: "R", iconUrls: ["https://www.robeco.com/apple-touch-icon.png"] },
  { key: "nordea", label: "Nordea", kind: "issuer", aliases: ["nordea"], domain: "nordea.com", monogram: "N" },
  { key: "swisscanto", label: "Swisscanto", kind: "issuer", aliases: ["swisscanto"], domain: "swisscanto.com", monogram: "SC" },
  { key: "coinshares", label: "CoinShares", kind: "issuer", aliases: ["coinshares", "coin shares"], domain: "coinshares.com", monogram: "CS" },
  { key: "21shares", label: "21Shares", kind: "issuer", aliases: ["21shares", "21 shares"], domain: "21shares.com", monogram: "21" },
  { key: "bitwise", label: "Bitwise", kind: "issuer", aliases: ["bitwise"], domain: "bitwiseinvestments.com", monogram: "BW" },
  { key: "sprott", label: "Sprott", kind: "issuer", aliases: ["sprott"], domain: "sprott.com", monogram: "S" },
];

/** Normalise punctuation away so "M&G" and "m and g" match the same alias. */
export function normalizeBrandName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function findBrand(value: string, kinds: BrandKind[]): Brand | null {
  const name = normalizeBrandName(value);
  if (!name) return null;
  const padded = ` ${name} `;
  let best: Brand | null = null;
  let bestLength = 0;
  for (const brand of BRANDS) {
    if (!kinds.includes(brand.kind)) continue;
    for (const alias of brand.aliases) {
      const normalized = normalizeBrandName(alias);
      if (normalized.length <= bestLength) continue;
      if (padded.includes(` ${normalized} `)) {
        best = brand;
        bestLength = normalized.length;
      }
    }
  }
  return best;
}

/** Provider/broker/platform name → brand. Issuer brands also work as providers. */
export function providerBrandForName(name: string): Brand | null {
  return findBrand(name, ["provider", "issuer", "both"]);
}

/**
 * Fund names that look like an ETF, index tracker or investment fund. Without
 * this guard, a company such as "Fidelity National Information" would be
 * mistaken for a Fidelity fund.
 */
const FUND_NAME_HINT =
  /(\betf\b|\betc\b|\bucits\b|\bindex\b|\bindexed\b|\btracker\b|\btracking\b|\bfund\b|\blifestrategy\b|\bmsci\b|\bftse\b|\bs&p\b|\bnasdaq\b|\ball[- ]world\b|\ball[- ]country\b|\bemerging\b|\bdividend\b|\baccumulat|\baccumulating\b|\bacc\b|\bdist\b|\bbond\b|\bbonds\b|\bequity\b|\bequities\b|\bincome\b|\bgrowth\b|\bsmall[- ]cap\b|\bmid[- ]cap\b|\bmulti[- ]asset\b|\bmoney market\b|\breit\b|\btrust\b|\bportfolio\b)/i;

/** ETF/fund issuer hidden in a holding name, e.g. "Vanguard FTSE All-World". */
export function issuerBrandForHolding(name: string | null | undefined): Brand | null {
  if (!name || !FUND_NAME_HINT.test(name)) return null;
  return findBrand(name, ["issuer", "both"]);
}

export function brandFaviconUrl(brand: Brand): string {
  return `${FAVICON_BASE}?domain=${encodeURIComponent(brand.domain)}&sz=128`;
}

function brandSources(brand: Brand): LogoSource[] {
  return [
    ...(brand.iconUrls ?? []).map((src) => ({ src, label: brand.label })),
    { src: brandFaviconUrl(brand), label: brand.label },
  ];
}

const EXCHANGE_SUFFIX: Record<string, string> = {
  LSE: ".L",
  LON: ".L",
  LONDON: ".L",
  L: ".L",
  XETRA: ".DE",
  GER: ".DE",
  FRA: ".DE",
  F: ".DE",
  ETR: ".DE",
  DE: ".DE",
  FRANKFURT: ".DE",
  EPA: ".PA",
  PAR: ".PA",
  PARIS: ".PA",
  PA: ".PA",
  AMS: ".AS",
  AS: ".AS",
  AMSTERDAM: ".AS",
  BRU: ".BR",
  BRUSSELS: ".BR",
  SWX: ".SW",
  SIX: ".SW",
  SW: ".SW",
  ZRH: ".SW",
  TOR: ".TO",
  TSX: ".TO",
  TO: ".TO",
  ASX: ".AX",
  AX: ".AX",
  HKG: ".HK",
  HK: ".HK",
  "HONG KONG": ".HK",
  TYO: ".T",
  TSE: ".T",
  JP: ".T",
  TOKYO: ".T",
  NASDAQ: "",
  NMS: "",
  NGM: "",
  NCM: "",
  NYSE: "",
  NYQ: "",
  NYS: "",
  NYSEARCA: "",
  ARCA: "",
  AMEX: "",
  ASE: "",
  AMX: "",
  OTC: "",
  PNK: "",
  US: "",
};

/** Parqet/FMP expect an exchange suffix for non-US listings (LSE → .L). */
export function tickerCandidates(symbol: string, exchange?: string | null): string[] {
  const base = symbol.trim().toUpperCase();
  if (!base) return [];
  if (base.includes(".")) return [base.replace(/\.LON$/, ".L")];
  const suffix = EXCHANGE_SUFFIX[exchange?.trim().toUpperCase() ?? ""];
  return suffix ? [`${base}${suffix}`] : [base];
}

export type LogoSource = { src: string; label: string };

/** Ordered logo URLs to try before falling back to a monogram. */
export function holdingLogoSources({
  symbol,
  name,
  exchange,
}: {
  symbol?: string | null;
  name?: string | null;
  exchange?: string | null;
}): LogoSource[] {
  const sources: LogoSource[] = [];
  if (isCashSymbol(symbol)) return sources;
  const issuer = issuerBrandForHolding(name);
  if (issuer) sources.push(...brandSources(issuer));

  if (symbol?.trim()) {
    for (const ticker of tickerCandidates(symbol, exchange)) {
      // CompaniesMarketCap keeps transparent, high-resolution US company marks.
      // Non-US listings usually 404 there, so only ask for unsuffixed tickers.
      if (!ticker.includes(".")) {
        sources.push({ src: `${CMC_BASE}/${encodeURIComponent(ticker)}.png`, label: ticker });
      }
      sources.push({ src: `${PARQET_BASE}/${encodeURIComponent(ticker)}?format=png&size=128`, label: ticker });
      sources.push({ src: `${FMP_BASE}/${encodeURIComponent(ticker)}.png`, label: ticker });
    }
  }
  return sources;
}

export function providerLogoSources(name?: string | null): LogoSource[] {
  const brand = name ? providerBrandForName(name) : null;
  return brand ? brandSources(brand) : [];
}

/**
 * Same-origin URL for the processed mark. Keeping the request internal means
 * the remote favicon/logo services never see individual availability
 * requests, and the route can normalise backgrounds before the browser paints.
 */
export function brandIconSrc({
  provider,
  symbol,
  name,
  exchange,
}: {
  provider?: string | null;
  symbol?: string | null;
  name?: string | null;
  exchange?: string | null;
}): string | null {
  if (!provider && isCashSymbol(symbol)) return null;
  const brand = provider ? providerBrandForName(provider) : issuerBrandForHolding(name);
  // Local vector marks are already transparent and infinitely sharp; let the
  // browser draw them directly instead of rasterising through the icon route.
  const local = brand?.iconUrls?.find((url) => url.startsWith("/brands/"));
  if (local) return local;

  const params = new URLSearchParams();
  if (provider?.trim()) {
    params.set("provider", provider.trim());
  } else if (symbol?.trim()) {
    params.set("symbol", symbol.trim());
    if (exchange?.trim()) params.set("exchange", exchange.trim());
    if (name?.trim()) params.set("name", name.trim());
  } else {
    return null;
  }
  params.set("v", BRAND_ICON_VERSION);
  return `/api/brand-icon?${params.toString()}`;
}

/** Fallback text for the monogram tile. */
export function monogramFor({
  provider,
  symbol,
  name,
}: {
  provider?: string | null;
  symbol?: string | null;
  name?: string | null;
}): string {
  if (provider) {
    const brand = providerBrandForName(provider);
    if (brand) return brand.monogram.slice(0, 3);
    const initials = provider
      .split(/\s+/)
      .filter((part) => /[a-z0-9]/i.test(part))
      .map((part) => part[0])
      .join("");
    return (initials || provider).slice(0, 2).toUpperCase();
  }
  // A fund name usually carries its issuer ("State Street SPDR …", "iShares …").
  // Showing the issuer's monogram reads far better than a random ticker stub.
  const issuer = issuerBrandForHolding(name);
  if (issuer) return issuer.monogram.slice(0, 3);
  return (symbol?.trim() || name?.trim() || "?").slice(0, 3).toUpperCase();
}
