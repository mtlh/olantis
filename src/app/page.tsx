import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, demoUserId } from "@/lib/auth";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { DemoButton } from "@/components/DemoButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";

/** The demo card's curve, rising into the card's top-right corner. */
const CHART =
  "M0 152 C22 148 38 155 60 143 C82 131 98 139 122 125 C146 111 162 119 186 106 C210 93 226 100 250 85 C274 70 290 76 314 58 C332 45 344 34 358 24 C368 17 380 12 389 8";

/**
 * The hero ring: the mark at hero scale. A hairline circle that wraps the
 * headline and the demo card, left open where the chart ends, so the chart's
 * bead sits in the break like the ring's green dot.
 */
const RING_R = 49.9;
const RING_GAP_DEG = 0.75;
/** The chart's last point sits 24.7° above the ring's centre: 555 right, 255 up. */
const RING_HIT_DEG = (Math.atan2(255, 555) * 180) / Math.PI;

function ringPoint(deg: number) {
  const rad = (deg * Math.PI) / 180;
  return `${(50 + RING_R * Math.cos(rad)).toFixed(2)} ${(50 - RING_R * Math.sin(rad)).toFixed(2)}`;
}

const RING_PATH = `M${ringPoint(RING_HIT_DEG + RING_GAP_DEG)} A${RING_R} ${RING_R} 0 1 0 ${ringPoint(
  RING_HIT_DEG - RING_GAP_DEG,
)}`;

const ACCOUNTS = [
  { name: "ISA", detail: "Global Tracker", value: "£42,800", color: "#60a5fa" },
  { name: "SIPP", detail: "S&P 500", value: "£18,200", color: "#34d399" },
  { name: "GIA", detail: "All-World", value: "£7,400", color: "#f472b6" },
];

export default async function Home() {
  const jar = await cookies();
  const demoSession = jar.get(DEMO_COOKIE)?.value;
  const isDemo = !!demoSession;
  let user: { id: string; email?: string; firstName?: string | null } | null = null;
  if (isDemo) user = { id: demoUserId(demoSession), email: "demo@olantis.local", firstName: "Demo" };
  else {
    try {
      const { withAuth } = await import("@workos-inc/authkit-nextjs");
      const auth = await withAuth({ ensureSignedIn: false });
      user = auth.user ?? null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
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
                <Link href="/" className={buttonVariants({ className: "mt-4" })}>Retry</Link>
              </CardContent>
            </Card>
          </div>
        );
      }
    }
  }
  if (user) redirect("/dashboard");

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <Link
        href="/"
        aria-label="Olantis — home"
        className="absolute top-0 left-0 z-10 p-6 transition-opacity hover:opacity-80 md:p-8"
      >
        <Logo size={28} />
      </Link>

      <main className="relative flex flex-1 flex-col">
        <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pt-24 pb-16 md:px-8 lg:grid-cols-2 lg:gap-20 lg:py-24">
          <div>
            <h1 className="rise text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-white sm:text-[44px] lg:text-[54px]">
              Your portfolios,
              <br />
              <span className="text-zinc-500">beautifully simple.</span>
            </h1>

            <p className="rise mt-5 max-w-[25rem] text-[15px] leading-relaxed text-zinc-400" style={{ animationDelay: "90ms" }}>
              Every account, holding and valuation in one place. Prices update daily, so the
              picture stays current.
            </p>

            <div className="rise mt-8 flex items-center gap-3" style={{ animationDelay: "180ms" }}>
              <DemoButton
                label="Explore the demo"
                className="h-11 rounded-full bg-white px-6 text-[13px] font-semibold text-black hover:bg-zinc-200"
              />
              <a
                href="/login"
                className="inline-flex h-11 items-center rounded-full border border-white/15 px-5 text-[13px] text-zinc-300 transition-colors hover:border-white/30 hover:text-white"
              >
                Sign in
              </a>
            </div>
          </div>

          <div className="rise relative" style={{ animationDelay: "220ms" }}>
            {/* The mark, blown up: a white ring around the hero, open at the chart's last point. */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-[8px] left-[97.25%] z-0 hidden w-[242.8%] -translate-x-[95.5%] -translate-y-[29.1%] xl:block"
            >
              <svg viewBox="0 0 100 100" fill="none" className="aspect-square w-full">
                <path
                  d={RING_PATH}
                  stroke="#fff"
                  strokeOpacity="0.28"
                  strokeWidth="0.1"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-8 -z-10 bg-[radial-gradient(60%_60%_at_55%_45%,rgba(52,211,153,0.10),transparent_72%)] blur-2xl"
            />
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f0f11] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_30px_80px_-40px_rgba(0,0,0,0.9)]">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-20 -bottom-28 h-64 w-64 rounded-full bg-emerald-500/[0.08] blur-3xl"
              />

              <div className="relative h-[176px]">
                <svg
                  viewBox="0 0 400 176"
                  className="absolute inset-0 h-full w-full"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <defs>
                    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d={`${CHART} L400 176 L0 176 Z`}
                    fill="url(#fade)"
                    style={{
                      maskImage: "linear-gradient(to right, #000 92%, transparent 100%)",
                      WebkitMaskImage: "linear-gradient(to right, #000 92%, transparent 100%)",
                    }}
                  />
                  <path
                    className="chart-line"
                    d={CHART}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    pathLength={1}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <span className="absolute top-6 left-7 text-[11px] text-zinc-500 sm:left-8">Demo</span>
                <span className="absolute top-[8px] right-[2.75%] h-1.5 w-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.55)]" />
              </div>

              <div className="relative px-7 pb-7 sm:px-8 sm:pb-8">
                <p className="text-[11px] text-zinc-400">Total value</p>

                <div className="mt-2 flex items-center gap-2.5">
                  <span className="text-[44px] font-semibold leading-none tracking-tight text-white tabular-nums">
                    £68,400
                  </span>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium leading-none text-emerald-400 tabular-nums">
                    +7.6%
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">+£4,820 over 12 months</p>

                <div className="mt-5 border-t border-white/[0.06]">
                  {ACCOUNTS.map((a, i) => (
                    <div
                      key={a.name}
                      className="rise flex items-center justify-between border-b border-white/[0.06] py-3.5 transition-colors last:border-b-0 hover:bg-white/[0.02]"
                      style={{ animationDelay: `${300 + i * 90}ms` }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="h-6 w-[3px] rounded-full" style={{ backgroundColor: a.color }} />
                        <span className="text-[13px] text-zinc-200">{a.name}</span>
                        <span className="text-[11px] text-zinc-500">{a.detail}</span>
                      </div>
                      <span className="text-[13px] text-zinc-300 tabular-nums">{a.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
