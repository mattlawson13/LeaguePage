import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SQLite snapshot isn't required via a static string literal
  // (lib/db/client.ts builds the path with path.join at runtime), so
  // Next's file-tracing can't discover it on its own — every dynamic route
  // needs it included explicitly or the deployed function 500s on a missing
  // file.
  outputFileTracingIncludes: {
    "/": ["./.data/league.db"],
    "/**": ["./.data/league.db"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sleepercdn.com",
        pathname: "/avatars/**",
      },
      {
        protocol: "https",
        hostname: "sleepercdn.com",
        pathname: "/content/nfl/players/**",
      },
      {
        protocol: "https",
        hostname: "sleepercdn.com",
        pathname: "/images/team_logos/nfl/**",
      },
    ],
  },
};

export default nextConfig;
