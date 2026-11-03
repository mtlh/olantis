import { pgTable, text, numeric, integer, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Money and share counts use `numeric` (unlimited-precision decimal) rather
 * than `real`/`double precision`. Postgres floats are binary approximations:
 * `real` carries only ~7 significant digits, so portfolio totals silently lose
 * pence above ~£100k and weighted-average cost drifts on every recalculation.
 * `numeric` stores exact decimal values. Drizzle maps them to JS `number` via
 * `mode: "number"` so call sites keep doing ordinary arithmetic; the exactness
 * benefit is at the storage/aggregation layer.
 */
const money = (name: string) => numeric(name, { mode: "number" });
const qty = (name: string) => numeric(name, { mode: "number" });

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order"),
  createdAt: integer("created_at").notNull(),
}, (t) => ({ userIdIdx: index("accounts_user_id_idx").on(t.userId) }));

export const providers = pgTable("providers", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order"),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  userIdIdx: index("providers_user_id_idx").on(t.userId),
  accountIdIdx: index("providers_account_id_idx").on(t.accountId),
}));

export const portfolios = pgTable("portfolios", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  providerId: text("provider_id").references(() => providers.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order"),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  userIdIdx: index("portfolios_user_id_idx").on(t.userId),
  accountIdIdx: index("portfolios_account_id_idx").on(t.accountId),
  providerIdIdx: index("portfolios_provider_id_idx").on(t.providerId),
}));

export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  currency: text("currency"),
  dateFormat: text("date_format"),
  defaultRange: text("default_range"),
  showTradeMarkers: integer("show_trade_markers"),
  updatedAt: integer("updated_at").notNull(),
});

export const fxRates = pgTable("fx_rates", {
  currency: text("currency").notNull(),
  date: text("date").notNull(),
  rateToGbp: money("rate_to_gbp").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.currency, t.date] }) }));

export const holdings = pgTable("holdings", {
  id: text("id").primaryKey(),
  portfolioId: text("portfolio_id").references(() => portfolios.id, { onDelete: "cascade" }),
  providerId: text("provider_id").references(() => providers.id, { onDelete: "cascade" }),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  shares: qty("shares").notNull(),
  avgPrice: money("avg_price").notNull(),
  currentPrice: money("current_price").notNull(),
  currency: text("currency"),
  sector: text("sector"),
  purchaseDate: text("purchase_date"),
  exchange: text("exchange"),
  lastRefreshedAt: integer("last_refreshed_at"),
}, (t) => ({
  userIdIdx: index("holdings_user_id_idx").on(t.userId),
  portfolioIdIdx: index("holdings_portfolio_id_idx").on(t.portfolioId),
  providerIdIdx: index("holdings_provider_id_idx").on(t.providerId),
  accountIdIdx: index("holdings_account_id_idx").on(t.accountId),
}));

export const snapshots = pgTable("snapshots", {
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  value: money("value").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.date] }) }));

export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  userId: text("user_id").notNull(),
  portfolioId: text("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  value: money("value").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.portfolioId, t.date] }) }));

export const holdingSnapshots = pgTable("holding_snapshots", {
  userId: text("user_id").notNull(),
  holdingId: text("holding_id").notNull().references(() => holdings.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  value: money("value").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.holdingId, t.date] }) }));

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  portfolioId: text("portfolio_id").references(() => portfolios.id, { onDelete: "cascade" }),
  holdingId: text("holding_id").references(() => holdings.id, { onDelete: "set null" }),
  symbol: text("symbol").notNull(),
  name: text("name"),
  type: text("type").notNull(),
  shares: qty("shares").notNull(),
  price: money("price").notNull(),
  date: text("date").notNull(),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  userIdIdx: index("transactions_user_id_idx").on(t.userId),
  portfolioIdIdx: index("transactions_portfolio_id_idx").on(t.portfolioId),
  holdingIdIdx: index("transactions_holding_id_idx").on(t.holdingId),
}));

export const watchlistItems = pgTable("watchlist_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  exchange: text("exchange"),
  currency: text("currency"),
  createdAt: integer("created_at").notNull(),
}, (t) => ({ userSymbolUnique: uniqueIndex("watchlist_items_user_symbol_unique").on(t.userId, t.symbol) }));

export const goals = pgTable("goals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  targetValue: money("target_value").notNull(),
  targetDate: text("target_date").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => ({ userIdIdx: index("goals_user_id_idx").on(t.userId) }));

export const quoteDaily = pgTable("quote_daily", {
  symbol: text("symbol").notNull(),
  date: text("date").notNull(),
  price: money("price").notNull(),
  currency: text("currency"),
  updatedAt: integer("updated_at").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.symbol, t.date] }) }));
