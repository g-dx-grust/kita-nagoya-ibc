import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  async rewrites() {
    return [
      { source: "/api/kitanagoya/:path*", destination: "/api/:path*" },
      { source: "/manufacturing/kitanagoya", destination: "/" },
      { source: "/manufacturing/kitanagoya/:path*", destination: "/:path*" },
    ];
  },
};

export default config;
