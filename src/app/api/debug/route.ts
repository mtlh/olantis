export async function GET() {
  const env = {
    hasClientId: !!process.env.WORKOS_CLIENT_ID,
    clientIdPrefix: process.env.WORKOS_CLIENT_ID?.slice(0, 18) ?? null,
    hasApiKey: !!process.env.WORKOS_API_KEY,
    redirectUri: process.env.WORKOS_REDIRECT_URI ?? null,
    publicRedirectUri: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? null,
    hasCookiePassword: !!process.env.WORKOS_COOKIE_PASSWORD,
    cookiePasswordLen: process.env.WORKOS_COOKIE_PASSWORD?.length ?? 0,
    cronSecretSet: !!process.env.CRON_SECRET,
  };
  let jwksOk = false;
  let jwksError: string | null = null;
  try {
    const cid = process.env.WORKOS_CLIENT_ID;
    const res = await fetch(`https://api.workos.com/sso/jwks/${cid}`, { cache: "no-store" });
    jwksOk = res.ok;
    if (!res.ok) jwksError = `${res.status} ${await res.text().then((t) => t.slice(0, 200))}`;
  } catch (e: any) { jwksError = String(e?.message ?? e); }
  return Response.json({ env, jwks: { ok: jwksOk, error: jwksError }, hint: "If jwks !ok, WORKOS_CLIENT_ID/API_KEY mismatch. If redirectUri mismatch, update dashboard.workos.com Redirects. Restart dev after .env changes and hard-refresh (clear wos- cookies)." });
}
