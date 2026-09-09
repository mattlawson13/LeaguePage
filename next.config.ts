import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
