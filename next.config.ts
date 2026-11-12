import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // WebP avoids the extra AVIF encoding work on the first image request.
    formats: ["image/webp"],
    qualities: [75, 80, 100],
    minimumCacheTTL: 2592000,
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    // Admin-uploaded legacy images use versioned local API URLs.
    localPatterns: [{ pathname: "/**" }],
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "*.blob.vercel-storage.com",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/:path((?!api/|_next/).*)",
        has: [{ type: "host", value: "saksuuu-topup.vercel.app" }],
        destination: "https://www.asuratopup.store/:path",
        permanent: true,
      },
      {
        source: "/:path((?!api/|_next/).*)",
        has: [{ type: "host", value: "asuratopup.vercel.app" }],
        destination: "https://www.asuratopup.store/:path",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
