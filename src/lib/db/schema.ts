import { pgTable, text, real, integer, primaryKey } from "drizzle-orm/pg-core";
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  color: text("color"),
  createdAt: integer("created_at").notNull(),
});
export const providers = pgTable("providers", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
  createdAt: integer("created_at").notNull(),
});
export const portfolios = pgTable("portfolios", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  providerId: text("provider_id").references(() => providers.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  color: text("color"),
  createdAt: integer("created_at").notNull(),
});
export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  currency: text("currency"),
  dateFormat: text("date_format"),
  defaultRange: text("default_range"),
  showTradeMarkers: integer("show_trade_markers"),
  updatedAt: integer("updated_at").notNull(),
});
export const holdings = pgTable("holdings", {
  id: text("id").primaryKey(),
  portfolioId: text("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  shares: real("shares").notNull(),
  avgPrice: real("avg_price").notNull(),
  currentPrice: real("current_price").notNull(),
  currency: text("currency"),
  purchaseDate: text("purchase_date"),
  exchange: text("exchange"),
  lastRefreshedAt: integer("last_refreshed_at"),
});
export const snapshots = pgTable("snapshots", {
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  value: real("value").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.date] }) }));
export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  userId: text("user_id").notNull(),
  portfolioId: text("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  value: real("value").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.portfolioId, t.date] }) }));
export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  portfolioId: text("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  holdingId: text("holding_id").references(() => holdings.id, { onDelete: "set null" }),
  symbol: text("symbol").notNull(),
  name: text("name"),
  type: text("type").notNull(),
  shares: real("shares").notNull(),
  price: real("price").notNull(),
  date: text("date").notNull(),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
});
