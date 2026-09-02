import { getDb } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  const db = getDb();
  const allHoldings = await db.select().from(holdings);
  let fixed = 0;
  for (const h of allHoldings) {
    if (/^CASH$/i.test(h.symbol.trim()) && h.currentPrice !== 1) {
      await db.update(holdings).set({ currentPrice: 1, currency: h.currency || "USD" }).where(eq(holdings.id, h.id));
      fixed++;
    }
  }
  return Response.json({ ok: true, fixed });
}
