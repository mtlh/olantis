import { Dashboard } from "@/components/Dashboard";
import { cookies, headers } from "next/headers";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";

export default async function Home() {
  const jar = await cookies();
  const isDemo = jar.get("olantis_demo")?.value === "1";
  let user: any = null;
  if (isDemo) user = { id: "demo", email: "demo@olantis.local", firstName: "Demo" };
  else {
    try {
      const { withAuth } = await import("@workos-inc/authkit-nextjs");
      const auth = await withAuth({ ensureSignedIn: false } as any);
      user = (auth as any).user ?? null;
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (!msg.includes("isn't covered by the AuthKit")) throw e;
      const h = await headers();
      const c = await cookies();
      const hasSession = c.getAll().some((x) => x.name === "wos-session");
      if (hasSession) {
        return (
          <div className="min-h-screen flex items-center justify-center p-6">
            <Card className="glass-card max-w-lg w-full">
              <CardHeader><CardTitle className="text-white">Restart dev server</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-400">Proxy not covering /. Restart <code className="text-white">npm run dev</code>.</p>
                <pre className="text-xs mt-3 p-3 rounded-xl bg-black/50 text-zinc-300">hasMiddleware: {String(!!h.get("x-workos-middleware"))}</pre>
                <a href="/" className={buttonVariants({ className: "mt-4" })}>Retry</a>
              </CardContent>
            </Card>
          </div>
        );
      }
    }
  }
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <nav className="flex items-center justify-between px-6 md:px-10 py-6 max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <span className="hidden md:inline text-xs text-zinc-600 border border-white/10 px-2 py-0.5 rounded-full">Personal Finance</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/signin" className={buttonVariants({ variant: "ghost", size: "sm" })}>Sign in</a>
            <a href="/login" className={buttonVariants({ size: "sm" })}>Get started</a>
          </div>
        </nav>
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-6xl w-full grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-400">Black glass • Grey cards • Colour only for charts</div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mt-4 leading-tight">Your portfolios,<br /><span className="text-zinc-500">beautifully simple.</span></h1>
                <p className="text-sm text-zinc-400 mt-4 max-w-md">Inspired by Umbris — stripped to essentials. Accounts group portfolios in the sidebar, live holdings, value over time. Auth via WorkOS.</p>
                <div className="flex gap-3 mt-6">
                  <a href="/login" className={buttonVariants({})}>Sign in to dashboard →</a>
                  <a href="/api/demo" className={buttonVariants({ variant: "outline", className: "bg-white/5 border-white/10 hover:bg-white/10" })}>Try demo →</a>
                </div>
                <div className="flex items-center gap-6 mt-8 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Live prices</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />Private by design</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-300" />No tracking</span>
                </div>
              </div>
              <Card className="glass-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-xs tracking-widest uppercase text-zinc-500">Live preview</CardTitle>
                  <span className="text-xs px-2 py-1 rounded-full bg-white text-black">Demo</span>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { n: "ISA", v: "£42,800", c: "#60a5fa" },
                    { n: "SIPP", v: "£18,200", c: "#34d399" },
                    { n: "GIA", v: "£7,400", c: "#f472b6" },
                  ].map((p) => (
                    <div key={p.n} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <span className="flex items-center gap-2 text-sm text-zinc-300"><span className="w-2.5 h-2.5 rounded-full" style={{ background: p.c }} />{p.n}</span>
                      <span className="text-sm font-semibold text-white">{p.v}</span>
                    </div>
                  ))}
                  <div className="mt-4 h-[100px] rounded-xl bg-white/[0.03] border border-white/5 grid place-items-center text-xs text-zinc-600">Value over time chart</div>
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="max-w-6xl mx-auto w-full px-6 md:px-10 pb-10 grid md:grid-cols-3 gap-4">
            {[
              { t: "Portfolios in nav", d: "Create multiple, switch via left bar. Local-first, instant." },
              { t: "Live tickers", d: "One-click refresh. GBX→GBP handled." },
              { t: "Charts that matter", d: "Value over time + allocation. Colour reserved for data." },
            ].map((f) => (
              <Card key={f.t} className="glass-card">
                <CardHeader><CardTitle className="text-sm text-white">{f.t}</CardTitle></CardHeader>
                <CardContent><p className="text-xs text-zinc-500">{f.d}</p></CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return <Dashboard user={user} isDemo={isDemo} />;
}
