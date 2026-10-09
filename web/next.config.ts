import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Минимальная сборка для Docker-образа (.next/standalone)
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
