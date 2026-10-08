import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["playwright-core"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/playwright-core/browsers.json"],
  },
  turbopack: {},
};

export default nextConfig;
