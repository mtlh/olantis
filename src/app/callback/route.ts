import { handleAuth } from "@workos-inc/authkit-nextjs";
export const GET = handleAuth({
  onError: async ({ error, request }) => {
    const url = new URL(request.url);
    const hasCode = url.searchParams.has("code");
    const hasState = url.searchParams.has("state");
    if (!hasCode && !hasState) {
      return new Response(
        JSON.stringify({
          error: "Direct visit to /callback",
          message: "This URL is only for WorkOS to redirect back to after sign-in. Go to / to sign in, or /login to start the flow.",
          hint: "You hit /callback without ?code&state — click Sign in on / instead. If you clicked Sign in and still landed here without params, your Sign-in URL in WorkOS dashboard is misconfigured (should be http://localhost:3000/login).",
        }, null, 2),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    console.error("[WorkOS callback error]", error, request.url);
    return new Response(
      JSON.stringify({
        error: "WorkOS callback failed",
        message: (error as any)?.message ?? String(error),
        cause: (error as any)?.cause ?? null,
        debug: { hasCode, hasState, host: url.host, redirectUri: process.env.WORKOS_REDIRECT_URI },
      }, null, 2),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  },
});
