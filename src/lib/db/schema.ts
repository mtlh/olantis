import { pgTable, text, real, integer, primaryKey } from "drizzle-orm/pg-core";
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const portfolios = pgTable("portfolios", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  createdAt: integer("created_at").notNull(),
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
