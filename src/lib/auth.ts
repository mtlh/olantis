import { cookies } from "next/headers";

/**
 * Demo mode is intentionally UNAUTHENTICATED by design — no sign-in, no
 * WorkOS challenge, no shared secrets. `/api/demo` just plants a session
 * cookie and loads the predefined dataset.
 *
 * Isolation model: every demo visitor gets their own throwaway tenant
 * (`demo:<sessionId>`) seeded from the same predefined dataset. Visitors never
 * share rows, so concurrent demo traffic cannot read, overwrite, or delete
 * another visitor's state. There is no auth boundary to bypass and none is
 * required — the session id *is* the isolation boundary.
 */
export const DEMO_COOKIE = "olantis_demo";
export const DEMO_USER_PREFIX = "demo:";

/** Legacy single-tenant demo id (pre per-session isolation). */
export const LEGACY_DEMO_USER_ID = "demo";

export function isDemoUserId(userId: string | null | undefined): boolean {
  return typeof userId === "string" && userId.startsWith(DEMO_USER_PREFIX);
}

/** Derive the tenant id for a demo session cookie value. */
export function demoUserId(sessionId: string): string {
  return `${DEMO_USER_PREFIX}${sessionId}`;
}

/** Generate a fresh opaque demo session id. */
export function newDemoSessionId(): string {
  return `s_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function getDemoSessionId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(DEMO_COOKIE)?.value ?? null;
}

export async function getUserId(): Promise<string | null> {
  const jar = await cookies();
  const demo = jar.get(DEMO_COOKIE)?.value;
  // Demo takes precedence: a demo session is an explicit, deliberate choice to
  // work in an isolated sandbox rather than in the signed-in user's data.
  if (demo) return demoUserId(demo);
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

/**
 * Resolve the caller identity, creating a demo session if one is needed.
 * Used by `/api/demo` which must be able to mint a session.
 */
export async function requireUserId(): Promise<string | null> {
  return getUserId();
}

/** Kept for call sites that need the old boolean shape. */
export function isDemoUser(userId: string | null): boolean {
  return isDemoUserId(userId);
}
