export const PALETTE = [
  { id: "blue", label: "Blue", value: "#60a5fa" },
  { id: "emerald", label: "Emerald", value: "#34d399" },
  { id: "pink", label: "Pink", value: "#f472b6" },
  { id: "amber", label: "Amber", value: "#facc15" },
  { id: "violet", label: "Violet", value: "#a78bfa" },
  { id: "red", label: "Rose", value: "#fb7185" },
  { id: "sky", label: "Sky", value: "#38bdf8" },
  { id: "orange", label: "Orange", value: "#f97316" },
  { id: "teal", label: "Teal", value: "#2dd4bf" },
  { id: "indigo", label: "Indigo", value: "#818cf8" },
  { id: "lime", label: "Lime", value: "#84cc16" },
  { id: "zinc", label: "Zinc", value: "#71717a" },
] as const;

export function tintColor(color: string, amount: number) {
  try {
    const hexMatch = /^#([\da-f]{6})$/i.exec(color);
    const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(color);
    const channels = hexMatch
      ? [0, 2, 4].map((offset) => parseInt(hexMatch[1].slice(offset, offset + 2), 16))
      : rgbMatch ? rgbMatch.slice(1, 4).map(Number) : null;
    if (!channels || channels.some((channel) => !Number.isFinite(channel))) return color;
    let [r, g, b] = channels;
    r = Math.round(Math.min(255, Math.max(0, r + amount * 255)));
    g = Math.round(Math.min(255, Math.max(0, g + amount * 255)));
    b = Math.round(Math.min(255, Math.max(0, b + amount * 255)));
    return `rgb(${r}, ${g}, ${b})`;
  } catch { return color; }
}

export const TINT_STEPS = [0, 0.18, -0.18, 0.32, -0.32, 0.12, -0.12] as const;

export function portfolioTint(base: string | null | undefined, index: number) {
  if (!base) return PALETTE[index % PALETTE.length].value;
  return tintColor(base, TINT_STEPS[index % TINT_STEPS.length]);
}

type ColorItem = { id: string; color: string | null; sortOrder?: number | null };
type ColorAccount = ColorItem;
type ColorProvider = ColorItem & { accountId: string };
type ColorPortfolio = ColorItem & { accountId: string | null; providerId: string | null };

// Color resolution runs per portfolio row and per chart series. Building the
// sibling order from scratch each time is O(n log n) per lookup — quadratic for
// a list of portfolios. Cache one ordered index per group on the array itself;
// store updates replace the array, so the cache cannot go stale.
type OrderedIndex = Map<string, number>;
const orderedIndexCache = new WeakMap<readonly ColorItem[], Map<string, OrderedIndex>>();

function orderedIndexInGroup<T extends ColorItem>(
  items: readonly T[],
  groupKey: string,
  groupOf: (item: T) => string,
  id: string,
) {
  let groups = orderedIndexCache.get(items);
  if (!groups) {
    groups = new Map();
    orderedIndexCache.set(items, groups);
  }
  let index = groups.get(groupKey);
  if (!index) {
    const siblings = items
      .filter((item) => groupOf(item) === groupKey)
      .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    index = new Map();
    siblings.forEach((item, position) => {
      if (!index!.has(item.id)) index!.set(item.id, position);
    });
    groups.set(groupKey, index);
  }
  return Math.max(0, index.get(id) ?? -1);
}

const accountIndexCache = new WeakMap<readonly ColorAccount[], Map<string, number>>();

export function resolveAccountColor(account: ColorAccount, accounts: readonly ColorAccount[]) {
  if (account.color) return account.color;
  let index = accountIndexCache.get(accounts);
  if (!index) {
    index = new Map<string, number>();
    accounts.forEach((item, position) => {
      if (!index!.has(item.id)) index!.set(item.id, position);
    });
    accountIndexCache.set(accounts, index);
  }
  const position = index.get(account.id);
  return PALETTE[(position === undefined || position < 0 ? 0 : position) % PALETTE.length].value;
}

export function resolveProviderColor(
  provider: ColorProvider,
  providers: readonly ColorProvider[],
  accounts: readonly ColorAccount[],
) {
  if (provider.color) return provider.color;
  const account = accounts.find((item) => item.id === provider.accountId);
  const accountColor = account ? resolveAccountColor(account, accounts) : PALETTE[0].value;
  return portfolioTint(
    accountColor,
    orderedIndexInGroup(providers, `account:${provider.accountId}`, (item) => item.accountId, provider.id),
  );
}

export function resolvePortfolioColor(
  portfolio: ColorPortfolio,
  portfolios: readonly ColorPortfolio[],
  providers: readonly ColorProvider[],
  accounts: readonly ColorAccount[],
) {
  if (portfolio.color) return portfolio.color;

  const provider = portfolio.providerId
    ? providers.find((item) => item.id === portfolio.providerId)
    : undefined;
  if (provider) {
    const providerColor = resolveProviderColor(provider, providers, accounts);
    return portfolioTint(
      providerColor,
      orderedIndexInGroup(portfolios, `provider:${provider.id}`, (item) => item.providerId ?? "", portfolio.id),
    );
  }

  const account = portfolio.accountId
    ? accounts.find((item) => item.id === portfolio.accountId)
    : undefined;
  if (account) {
    const accountColor = resolveAccountColor(account, accounts);
    return portfolioTint(
      accountColor,
      orderedIndexInGroup(
        portfolios,
        `account:${account.id}`,
        (item) => (item.providerId ? "" : item.accountId ?? ""),
        portfolio.id,
      ),
    );
  }

  return portfolioTint(
    null,
    orderedIndexInGroup(portfolios, "unassigned", (item) => (!item.accountId && !item.providerId ? "unassigned" : ""), portfolio.id),
  );
}
