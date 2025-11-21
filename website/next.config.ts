import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/commit-watcher',
  assetPrefix: '/commit-watcher',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
