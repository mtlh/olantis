import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, demoUserId } from "@/lib/auth";
import { Dashboard, type DashboardSection } from "@/components/Dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export async function AuthenticatedDashboardPage({ section }: { section: DashboardSection }) {
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
        const path = section === "dashboard" ? "/dashboard" : `/${section}`;
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
  return <Dashboard isDemo={isDemo} section={section} />;
}
