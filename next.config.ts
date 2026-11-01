import type { NextConfig } from "next";

const posthogHost = () => (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/+$/, "");

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    const host = posthogHost();
    return [
      { source: "/ingest/static/:path*", destination: `${host}/static/:path*` },
      { source: "/ingest/:path*", destination: `${host}/:path*` },
    ];
  },
};

export default config;
