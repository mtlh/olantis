import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, demoUserId } from "@/lib/auth";
import { loadWorkspaceBootstrap, type WorkspaceBootstrap } from "@/lib/bootstrap";
import { WorkspaceDataProvider } from "@/lib/store";
import { Dashboard } from "@/components/Dashboard";
import { WorkspaceBootScreen } from "@/components/WorkspaceBootScreen";
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

  // Resolve the workspace data on the server so the first HTML already shows
  // real numbers instead of a client-fetch skeleton. If the database is
  // unreachable we fall back to the client-side loaders (null bootstrap).
  //
  // The read is started here but awaited inside the Suspense boundary below, so
  // the shell streams immediately. That matters most right after "Try demo":
  // the redirect lands on a visible progress screen instead of an idle tab
  // while the freshly seeded tenant is read back.
  const bootstrap: Promise<WorkspaceBootstrap | null> = loadWorkspaceBootstrap(user.id).catch(() => null);

  return (
    <Suspense fallback={<WorkspaceBootScreen isDemo={isDemo} />}>
      <WorkspaceShell bootstrap={bootstrap} isDemo={isDemo} />
    </Suspense>
  );
}

async function WorkspaceShell({
  bootstrap,
  isDemo,
}: {
  bootstrap: Promise<WorkspaceBootstrap | null>;
  isDemo: boolean;
}) {
  const value = await bootstrap;
  return (
    <WorkspaceDataProvider value={value}>
      <Dashboard isDemo={isDemo} />
    </WorkspaceDataProvider>
  );
}
