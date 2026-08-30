import { Dashboard } from "@/components/Dashboard";
import { cookies, headers } from "next/headers";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { ArrowRight, BarChart3, Clock3, Layers, LineChart, Lock, ShieldCheck, Sparkles, Wallet, EyeOff, Database, TrendingUp, Landmark } from "lucide-react";

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
        <nav className="sticky top-0 z-40 backdrop-blur-xl bg-black/30 border-b border-white/[0.06]">
          <div className="flex items-center justify-between px-6 md:px-10 py-4 max-w-6xl mx-auto w-full">
            <a href="/" className="flex items-center gap-3">
              <Logo size={34} />
              <span className="hidden md:inline text-[10px] tracking-widest uppercase text-zinc-600 border border-white/10 px-2 py-0.5 rounded-full">Personal Finance</span>
            </a>
            <div className="flex items-center gap-2">
              <a href="/login" className={buttonVariants({ variant: "ghost", size: "sm", className: "text-zinc-400 hover:text-white" })}>Sign in</a>
              <a href="/login" className={buttonVariants({ size: "sm" })}>Get started <ArrowRight className="w-3.5 h-3.5" /></a>
            </div>
          </div>
        </nav>

        <div className="flex-1">
          <section className="max-w-6xl mx-auto w-full px-6 md:px-10 pt-12 md:pt-20 pb-10">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-400">
                  <Sparkles className="w-3 h-3 text-zinc-300" /> Black glass • Grey cards • Colour only for charts
                </div>
                <h1 className="text-4xl md:text-[52px] font-bold tracking-tight text-white mt-5 leading-[0.95]">
                  Your portfolios,<br /><span className="text-zinc-500">beautifully simple.</span>
                </h1>
                <p className="text-sm md:text-[15px] leading-relaxed text-zinc-400 mt-4 max-w-[480px]">
                  Inspired by Umbris — stripped to essentials. Accounts group portfolios in the sidebar, live holdings, value over time. No spreadsheets. No clutter. Just clarity.
                </p>
                <div className="flex flex-wrap gap-3 mt-7">
                  <a href="/login" className={buttonVariants({ size: "lg", className: "h-10 px-6 bg-white text-black hover:bg-zinc-200 font-semibold" })}>Sign in to dashboard <ArrowRight className="w-4 h-4" /></a>
                  <a href="/api/demo" className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 px-6 bg-white/[0.06] border-white/10 hover:bg-white/10 text-white" })}>Try demo <ArrowRight className="w-4 h-4" /></a>
                </div>
                <p className="text-xs text-zinc-600 mt-3">WorkOS auth • No credit card • Demo is instant</p>
                <div className="flex flex-wrap items-center gap-6 mt-8 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Live Yahoo prices</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />Private by design</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-300" />No tracking</span>
                </div>
                <div className="flex items-center gap-3 mt-9 pt-6 border-t border-white/5">
                  <div className="flex -space-x-2">
                    {["#60a5fa","#34d399","#f472b6"].map(c=> <span key={c} className="w-7 h-7 rounded-full border-2 border-black grid place-items-center text-[10px] font-bold text-white" style={{background:c}}>£</span>)}
                  </div>
                  <p className="text-xs text-zinc-500"><span className="text-white font-medium">3 demo portfolios</span> pre-loaded • 1 click to explore</p>
                </div>
              </div>

              <Card className="glass-card overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between py-4">
                  <CardTitle className="text-[11px] tracking-[0.14em] uppercase text-zinc-500 font-semibold flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live preview</CardTitle>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-white text-black font-medium">Demo</span>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { n: "ISA", v: "£42,800", sub: "Global Tracker • +8.4%", c: "#60a5fa" },
                    { n: "SIPP", v: "£18,200", sub: "S&P 500 • +5.1%", c: "#34d399" },
                    { n: "GIA", v: "£7,400", sub: "All-World • +3.2%", c: "#f472b6" },
                  ].map((p) => (
                    <div key={p.n} className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.04] border border-white/5">
                      <span className="flex items-center gap-2.5 text-sm text-zinc-300"><span className="w-2.5 h-2.5 rounded-full" style={{ background: p.c }} />{p.n}<span className="text-xs text-zinc-600 hidden sm:inline">{p.sub}</span></span>
                      <span className="text-sm font-semibold text-white tabular-nums">{p.v}</span>
                    </div>
                  ))}
                  <div className="mt-1 rounded-xl bg-white/[0.03] border border-white/5 p-3">
                    <div className="flex items-center justify-between text-[11px] text-zinc-600 mb-2"><span>Value over time</span><span className="text-emerald-400">+£4,820 • +7.6%</span></div>
                    <svg viewBox="0 0 300 70" className="w-full h-[72px]">
                      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="white" stopOpacity="0.18"/><stop offset="100%" stopColor="white" stopOpacity="0"/></linearGradient></defs>
                      <path d="M0 52 L30 48 L60 55 L90 38 L120 42 L150 28 L180 33 L210 18 L240 22 L270 10 L300 14 L300 70 L0 70 Z" fill="url(#g)" />
                      <path d="M0 52 L30 48 L60 55 L90 38 L120 42 L150 28 L180 33 L210 18 L240 22 L270 10 L300 14" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
                      <path d="M0 52 L30 48 L60 55 L90 38 L120 42 L150 28 L180 33 L210 18 L240 22 L270 10 L300 14" fill="none" stroke="#60a5fa" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="4 4" opacity="0.7" />
                    </svg>
                    <div className="flex justify-between text-[10px] text-zinc-600 mt-1"><span>1Y</span><span>MAX</span></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="rounded-lg bg-white text-black p-2.5"><div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Total</div><div className="text-sm font-bold">£68,400</div></div>
                    <div className="rounded-lg bg-white/5 border border-white/10 p-2.5"><div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Gain</div><div className="text-sm font-bold text-emerald-400">+£4,820</div></div>
                    <div className="rounded-lg bg-white/5 border border-white/10 p-2.5"><div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Holdings</div><div className="text-sm font-bold text-white">8</div></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <div className="max-w-6xl mx-auto w-full px-6 md:px-10">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-6 border-y border-white/5 text-xs tracking-widest uppercase text-zinc-600">
              <span className="flex items-center gap-2"><Landmark className="w-3.5 h-3.5" /> WorkOS AuthKit</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span className="flex items-center gap-2"><Database className="w-3.5 h-3.5" /> Neon Postgres</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Yahoo Finance</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>Vercel Cron 06:00 UTC</span>
            </div>
          </div>

          <section className="max-w-6xl mx-auto w-full px-6 md:px-10 pt-10 pb-4">
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { icon: Layers, t: "Portfolios in nav", d: "Create unlimited portfolios, group by account (ISA, SIPP, GIA). Switch via left bar. Local-first, instant." },
                { icon: LineChart, t: "Live tickers", d: "One-click refresh. GBX → GBP handled. Yahoo Finance chart history. Cron updates daily." },
                { icon: BarChart3, t: "Charts that matter", d: "Value over time + allocation. Per-portfolio or total. Colour reserved only for data." },
                { icon: ShieldCheck, t: "Private by design", d: "Your data isolated by user ID. No cross-user leakage. Drizzle + RLS-ready schema." },
                { icon: Lock, t: "Bank-grade auth", d: "WorkOS AuthKit. No passwords stored. Session middleware covers every route." },
                { icon: EyeOff, t: "No tracking", d: "No ads. No analytics cookies. No selling data. Your finances stay yours." },
              ].map((f) => (
                <Card key={f.t} className="glass-card">
                  <CardHeader className="pb-2">
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center mb-2"><f.icon className="w-4 h-4 text-zinc-300" /></div>
                    <CardTitle className="text-sm text-white">{f.t}</CardTitle>
                  </CardHeader>
                  <CardContent><p className="text-xs leading-relaxed text-zinc-500">{f.d}</p></CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="max-w-6xl mx-auto w-full px-6 md:px-10 py-8">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] overflow-hidden">
              <div className="grid lg:grid-cols-2 gap-0">
                <div className="p-8 md:p-10">
                  <div className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-zinc-500 font-semibold"><Clock3 className="w-3.5 h-3.5" /> How it works</div>
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mt-3">From zero to clarity in 60 seconds.</h2>
                  <div className="mt-8 space-y-6">
                    {[
                      { n: "01", t: "Sign in with WorkOS", d: "One click. No password to remember. Encrypted session, midnight auto-refresh." },
                      { n: "02", t: "Create accounts & portfolios", d: "Add ISA, SIPP, GIA accounts. Then portfolios: Live or Manual. Group them naturally." },
                      { n: "03", t: "Add holdings & watch", d: "Search symbol, add shares & avg price. Live price + history fetched instantly." },
                    ].map(s=> (
                      <div key={s.n} className="flex gap-4">
                        <span className="shrink-0 w-9 h-9 rounded-full bg-white text-black grid place-items-center text-xs font-bold">{s.n}</span>
                        <div><div className="text-sm font-semibold text-white">{s.t}</div><div className="text-xs text-zinc-500 mt-1 leading-relaxed">{s.d}</div></div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-8">
                    <a href="/login" className={buttonVariants({ className: "bg-white text-black hover:bg-zinc-200" })}>Start now <ArrowRight className="w-4 h-4" /></a>
                    <a href="/api/demo" className={buttonVariants({ variant: "outline", className: "bg-white/5 border-white/10 hover:bg-white/10 text-white" })}>Explore demo</a>
                  </div>
                </div>
                <div className="bg-black/40 border-t lg:border-t-0 lg:border-l border-white/5 p-6 md:p-8 flex flex-col justify-center">
                  <div className="space-y-3">
                    <div className="h-10 rounded-xl bg-white flex items-center justify-between px-4"><span className="text-sm font-semibold text-black flex items-center gap-2"><Wallet className="w-4 h-4" /> Global Tracker</span><span className="text-sm font-bold text-black">£12,768</span></div>
                    <div className="h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between px-4"><span className="text-sm text-zinc-400">VWRP • 120 × £106.40</span><span className="text-sm font-semibold text-white">£12,768</span></div>
                    <div className="h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between px-4"><span className="text-sm text-zinc-400">AAPL • 15 × $178</span><span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400">+22.7%</span></div>
                    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4 mt-2">
                      <div className="text-xs text-zinc-500 mb-2">Built for the long term</div>
                      <div className="flex items-center gap-2 text-sm text-zinc-300"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Your data never leaves your account</div>
                      <div className="flex items-center gap-2 text-sm text-zinc-300 mt-2"><Database className="w-4 h-4 text-blue-400" /> Neon Postgres • instant branching</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="max-w-6xl mx-auto w-full px-6 md:px-10 py-6">
            <Card className="glass-card overflow-hidden">
              <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/5 text-center">
                <div className="p-8"><div className="text-3xl font-bold text-white">£0</div><div className="text-xs tracking-widest uppercase text-zinc-500 mt-1">To start</div><p className="text-xs text-zinc-600 mt-2">Free while in beta</p></div>
                <div className="p-8"><div className="text-3xl font-bold text-white">~100ms</div><div className="text-xs tracking-widest uppercase text-zinc-500 mt-1">To load dashboard</div><p className="text-xs text-zinc-600 mt-2">Edge-cached, Turbopack built</p></div>
                <div className="p-8"><div className="text-3xl font-bold text-white">Daily</div><div className="text-xs tracking-widest uppercase text-zinc-500 mt-1">Price refresh</div><p className="text-xs text-zinc-600 mt-2">Cron at 06:00 UTC</p></div>
              </div>
            </Card>
          </section>

          <section className="max-w-6xl mx-auto w-full px-6 md:px-10 py-10">
            <div className="rounded-2xl bg-white text-black p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <h3 className="text-2xl font-bold tracking-tight">Ready to get clarity?</h3>
                <p className="text-sm text-zinc-600 mt-1">Sign in takes 2 seconds. Your first portfolio takes 10 more.</p>
              </div>
              <div className="flex gap-3 shrink-0">
                <a href="/login" className={buttonVariants({ size: "lg", className: "bg-black text-white hover:bg-zinc-800" })}>Sign in with WorkOS <ArrowRight className="w-4 h-4" /></a>
                <a href="/api/demo" className={buttonVariants({ variant: "outline", size: "lg", className: "border-black/10 hover:bg-zinc-100" })}>Try demo</a>
              </div>
            </div>
          </section>

          <footer className="border-t border-white/5 mt-2">
            <div className="max-w-6xl mx-auto w-full px-6 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
              <span className="flex items-center gap-2"><Logo size={24} /> © {new Date().getFullYear()} Olantis • Personal finance, simplified.</span>
              <span className="flex items-center gap-4"><a href="/login" className="hover:text-zinc-300">Sign in</a><a href="/api/demo" className="hover:text-zinc-300">Demo</a><a href="https://github.com/mtlh/olantis" className="hover:text-zinc-300">GitHub</a></span>
            </div>
          </footer>
        </div>
      </div>
    );
  }
  return <Dashboard user={user} isDemo={isDemo} />;
}
