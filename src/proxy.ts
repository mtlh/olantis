import { authkitProxy } from "@workos-inc/authkit-nextjs";
export default authkitProxy();
// Icon routes are static assets: keeping them out of the auth proxy means the
// browser tab icon never depends on WorkOS being configured or reachable.
export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|api/cron).*)"],
};
