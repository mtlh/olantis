import { type getDb } from "@/lib/db";
import { holdings, portfolios, accounts, providers } from "@/lib/db/schema";
import { and, eq, gt, inArray, or } from "drizzle-orm";

export type OwnedHoldingsFilters = {
  portfolioId?: string | null;
  providerId?: string | null;
  accountId?: string | null;
  /** Also return fully-sold positions (`shares = 0`), needed by history backfill. */
  includeEmpty?: boolean;
};

/**
 * Ownership predicate for a holding: it belongs to the user directly, or
 * through one of their accounts/providers/portfolios (legacy rows).
 *
 * Expressed as `IN (subquery)` rather than three `LEFT JOIN`s so the planner
 * can drive the scan from `holdings` and probe each owner index, instead of
 * joining every owner table before it can filter. It also means the caller can
 * slide this into a `db.batch()` — the scalar subqueries depend on nothing but
 * the user id.
 */
function ownedByUser(db: ReturnType<typeof getDb>, userId: string) {
  return or(
    eq(holdings.userId, userId),
    inArray(
      holdings.portfolioId,
      db.select({ id: portfolios.id }).from(portfolios).where(eq(portfolios.userId, userId)),
    ),
    inArray(
      holdings.providerId,
      db.select({ id: providers.id }).from(providers).where(eq(providers.userId, userId)),
    ),
    inArray(
      holdings.accountId,
      db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, userId)),
    ),
  );
}

/**
 * Query builder form of {@link loadOwnedHoldings}. Returned unawaited so call
 * sites can include it in a `db.batch()` with other independent reads and pay
 * for a single round trip.
 */
export function ownedHoldingsQuery(
  db: ReturnType<typeof getDb>,
  userId: string,
  filters?: OwnedHoldingsFilters
) {
  const conditions = [ownedByUser(db, userId)];
  if (!filters?.includeEmpty) conditions.push(gt(holdings.shares, 0));
  if (filters?.portfolioId) conditions.push(eq(holdings.portfolioId, filters.portfolioId));
  if (filters?.providerId) conditions.push(eq(holdings.providerId, filters.providerId));
  if (filters?.accountId) conditions.push(eq(holdings.accountId, filters.accountId));

  return db.select().from(holdings).where(and(...conditions));
}

export async function loadOwnedHoldings(
  db: ReturnType<typeof getDb>,
  userId: string,
  filters?: OwnedHoldingsFilters
): Promise<typeof holdings.$inferSelect[]> {
  return ownedHoldingsQuery(db, userId, filters);
}
