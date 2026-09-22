import { cookies } from "next/headers";

export const DEMO_USER_ID = "demo";

export async function getUserId(): Promise<string | null> {
  const jar = await cookies();
  if (jar.get("olantis_demo")?.value === "1") return DEMO_USER_ID;
  try {
    const { withAuth } = await import("@workos-inc/authkit-nextjs");
    const auth = await withAuth({ ensureSignedIn: false } as Record<string, unknown>);
    const user = (auth as { user?: { id?: unknown } | null }).user;
    if (user && typeof user === "object" && user.id != null) return String(user.id);
  } catch {
    /* not signed in / proxy not covering route */
  }
  return null;
}

export async function requireUserId(): Promise<string | null> {
  return getUserId();
}

export function isDemoUser(userId: string | null): boolean {
  return userId === DEMO_USER_ID;
}
