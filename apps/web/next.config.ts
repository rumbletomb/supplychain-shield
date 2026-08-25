import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: [],
    cpus: 1,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
