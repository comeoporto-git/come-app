import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "comeoporto.com",
        pathname: "/wp-content/uploads/**",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/guide/tours", destination: "/guide", permanent: false },
    ];
  },
};

export default nextConfig;
