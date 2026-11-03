import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/api/snapshots",
        headers: [{ key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=300" }],
      },
      {
        source: "/api/fx",
        headers: [{ key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=300" }],
      },
      {
        source: "/api/settings",
        headers: [{ key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=300" }],
      },
      {
        source: "/api/goals",
        headers: [{ key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=300" }],
      },
      {
        source: "/api/watchlist",
        headers: [{ key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=300" }],
      },
    ];
  },
};

export default nextConfig;