import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, demoUserId } from "@/lib/auth";
import { loadWorkspaceBootstrap } from "@/lib/bootstrap";
import { WorkspaceDataProvider } from "@/lib/store";
import { Dashboard } from "@/components/Dashboard";
import WorkspaceLoading from "@/app/(workspace)/loading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export async function AuthenticatedDashboardLayout() {
  const jar = await cookies();
  const demoSession = jar.get(DEMO_COOKIE)?.value;
  const isDemo = !!demoSession;
  let user: { id: string; email?: string; firstName?: string | null } | null = null;

  if (isDemo) user = { id: demoUserId(demoSession), email: "demo@olantis.local", firstName: "Demo" };
  else {
    try {
      const { withAuth } = await import("@workos-inc/authkit-nextjs");
      const auth = await withAuth({ ensureSignedIn: false } as Record<string, unknown>);
      user = auth.user ?? null;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (!message.includes("isn't covered by the AuthKit")) throw e;
      const requestHeaders = await headers();
      const requestCookies = await cookies();
      const hasSession = requestCookies.getAll().some((cookie) => cookie.name === "wos-session");
      if (hasSession) {
        const path = "/dashboard";
        return (
          <div className="min-h-screen flex items-center justify-center p-6">
            <Card className="glass-card max-w-lg w-full">
              <CardHeader><CardTitle className="text-white">Restart dev server</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-400">Proxy not covering {path}. Restart <code className="text-white">npm run dev</code>.</p>
                <pre className="text-xs mt-3 p-3 rounded-xl bg-black/50 text-zinc-300">hasMiddleware: {String(!!requestHeaders.get("x-workos-middleware"))}</pre>
                <a href={path} className={buttonVariants({ className: "mt-4" })}>Retry</a>
              </CardContent>
            </Card>
          </div>
        );
      }
    }
  }

  if (!user) redirect("/login");

  // Stream the workspace: auth resolves here (fast, no DB) so the shell can
  // paint immediately. The bootstrap (Neon db.batch + FX) resolves in the
  // Suspense child below, so first HTML is the WorkspaceLoading skeleton and
  // the dashboard streams in when the data lands. Previously this await
  // blocked the whole response and loading.tsx never painted.
  //
  // Demo + auth behaviour is unchanged: demo still bypasses WorkOS via the
  // olantis_demo cookie, unauthenticated users still redirect to /login.
  return (
    <WorkspaceDataProvider value={null}>
      <Suspense fallback={<WorkspaceLoading />}>
        <WorkspaceBootstrapView userId={user.id} isDemo={isDemo} />
      </Suspense>
    </WorkspaceDataProvider>
  );
}

async function WorkspaceBootstrapView({ userId, isDemo }: { userId: string; isDemo: boolean }) {
  // Null falls back to the client-side loaders (each hook fetches its own
  // /api/* route when the bootstrap is missing), so a DB outage still paints.
  const bootstrap = await loadWorkspaceBootstrap(userId).catch(() => null);

  return (
    <WorkspaceDataProvider value={bootstrap}>
      <Dashboard isDemo={isDemo} />
    </WorkspaceDataProvider>
  );
}
