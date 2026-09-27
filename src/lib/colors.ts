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

function orderedIndex<T extends ColorItem>(items: readonly T[], id: string) {
  const index = [...items]
    .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))
    .findIndex((item) => item.id === id);
  return Math.max(0, index);
}

export function resolveAccountColor(account: ColorAccount, accounts: readonly ColorAccount[]) {
  const index = accounts.findIndex((item) => item.id === account.id);
  return account.color || PALETTE[(index < 0 ? 0 : index) % PALETTE.length].value;
}

export function resolveProviderColor(
  provider: ColorProvider,
  providers: readonly ColorProvider[],
  accounts: readonly ColorAccount[],
) {
  if (provider.color) return provider.color;
  const account = accounts.find((item) => item.id === provider.accountId);
  const accountColor = account ? resolveAccountColor(account, accounts) : PALETTE[0].value;
  const siblings = providers.filter((item) => item.accountId === provider.accountId);
  return portfolioTint(accountColor, orderedIndex(siblings, provider.id));
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
    const siblings = portfolios.filter((item) => item.providerId === provider.id);
    return portfolioTint(providerColor, orderedIndex(siblings, portfolio.id));
  }

  const account = portfolio.accountId
    ? accounts.find((item) => item.id === portfolio.accountId)
    : undefined;
  if (account) {
    const accountColor = resolveAccountColor(account, accounts);
    const siblings = portfolios.filter((item) => item.accountId === account.id && !item.providerId);
    return portfolioTint(accountColor, orderedIndex(siblings, portfolio.id));
  }

  const unassigned = portfolios.filter((item) => !item.accountId && !item.providerId);
  return portfolioTint(null, orderedIndex(unassigned, portfolio.id));
}
