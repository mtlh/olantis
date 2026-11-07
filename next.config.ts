import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "@base-ui/react"],
  },
  async headers() {
    // Only endpoints whose data is safe to serve 30s stale are listed here.
    // /api/settings, /api/goals and /api/watchlist are deliberately excluded:
    // the client refetches them immediately after a mutation, and a browser
    // cache would hand back the pre-mutation response.
    return [
      {
        source: "/api/snapshots",
        headers: [{ key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=300" }],
      },
      {
        source: "/api/fx",
        headers: [{ key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=300" }],
      },
    ];
  },
};

export default nextConfig;
