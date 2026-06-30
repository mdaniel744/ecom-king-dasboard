import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allows the dev server to serve JS/CSS/RSC assets when accessed from
  // another device on the LAN (e.g. testing on a phone via 192.168.x.x:port)
  // — without this, Next.js's dev-only cross-origin protection silently
  // blocks those asset requests and the page renders blank past the
  // server-rendered <title>.
  allowedDevOrigins: ["192.168.1.184"],
};

export default nextConfig;
