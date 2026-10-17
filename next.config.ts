import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf",
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf",
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif.ttf",
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf",
      "./node_modules/dejavu-fonts-ttf/LICENSE",
    ],
  },
  // Allows the dev server to serve JS/CSS/RSC assets when accessed from
  // another device on the LAN (e.g. testing on a phone via 192.168.x.x:port)
  // — without this, Next.js's dev-only cross-origin protection silently
  // blocks those asset requests and the page renders blank past the
  // server-rendered <title>.
  allowedDevOrigins: ["192.168.1.184"],
  // Server Actions default to a 1MB request body cap, which the image
  // upload action (lib/storage.ts) would hit immediately on any real photo.
  // Matches the bucket's own file_size_limit (see the store-images migration).
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
