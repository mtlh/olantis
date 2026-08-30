import { cookies, headers } from "next/headers";
export async function GET() {
  const c = await cookies();
  const h = await headers();
  const cookieList = c.getAll().map((x) => ({ name: x.name, hasValue: !!x.value, len: x.value.length }));
  const hasMiddleware = h.get("x-workos-middleware");
  const hasSessionHeader = h.get("x-workos-session");
  let withAuthResult: any = null;
  let withAuthError: string | null = null;
  try {
    const { withAuth } = await import("@workos-inc/authkit-nextjs");
    const a = await withAuth({ ensureSignedIn: false } as any);
    withAuthResult = { user: a.user ? { id: a.user.id, email: (a.user as any).email } : null, hasUser: !!a.user };
  } catch (e: any) {
    withAuthError = String(e?.message ?? e);
  }
  return Response.json({
    cookies: cookieList,
    headers: { hasMiddleware: !!hasMiddleware, hasSessionHeader: !!hasSessionHeader, middleware: hasMiddleware, sessionHeaderPreview: hasSessionHeader?.slice(0, 20) ?? null },
    withAuth: withAuthResult,
    withAuthError,
    envRedirect: process.env.WORKOS_REDIRECT_URI,
  });
}
