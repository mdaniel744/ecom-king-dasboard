import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
