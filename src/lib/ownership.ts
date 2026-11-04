import { getDb } from "@/lib/db";
import { holdings, portfolios, accounts, providers } from "@/lib/db/schema";
import { and, eq, gt, isNotNull, or } from "drizzle-orm";

export type OwnedHoldingsFilters = {
  portfolioId?: string | null;
  providerId?: string | null;
  accountId?: string | null;
  /** Also return fully-sold positions (`shares = 0`), needed by history backfill. */
  includeEmpty?: boolean;
};

export async function loadOwnedHoldings(
  db: ReturnType<typeof getDb>,
  userId: string,
  filters?: OwnedHoldingsFilters
): Promise<typeof holdings.$inferSelect[]> {
  const conditions = [
    or(
      eq(holdings.userId, userId),
      isNotNull(portfolios.id),
      isNotNull(providers.id),
      isNotNull(accounts.id)
    ),
  ];
  if (!filters?.includeEmpty) conditions.push(gt(holdings.shares, 0));
  if (filters?.portfolioId) conditions.push(eq(holdings.portfolioId, filters.portfolioId));
  if (filters?.providerId) conditions.push(eq(holdings.providerId, filters.providerId));
  if (filters?.accountId) conditions.push(eq(holdings.accountId, filters.accountId));

  const rows = await db
    .select()
    .from(holdings)
    .leftJoin(portfolios, and(eq(portfolios.id, holdings.portfolioId), eq(portfolios.userId, userId)))
    .leftJoin(providers, and(eq(providers.id, holdings.providerId), eq(providers.userId, userId)))
    .leftJoin(accounts, and(eq(accounts.id, holdings.accountId), eq(accounts.userId, userId)))
    .where(and(...conditions));

  return rows.map((r) => r.holdings) as typeof holdings.$inferSelect[];
}