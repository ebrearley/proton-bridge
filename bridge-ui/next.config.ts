import type { NextConfig } from "next";

const bridgeControlUrl =
  process.env.BRIDGE_CONTROL_URL ?? "http://proton-bridge:8081";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/terminal",
          destination: `${bridgeControlUrl}/api/terminal`,
        },
      ],
    };
  },
};

export default nextConfig;
