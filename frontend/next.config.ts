import type { NextConfig } from "next";

const expressApi = process.env.EXPRESS_API_PROXY_TARGET || "http://127.0.0.1:3000";
const fastApi = process.env.FASTAPI_PROXY_TARGET || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.5"],
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${expressApi}/api/:path*` },
      { source: "/ml-api/:path*", destination: `${fastApi}/api/:path*` },
      { source: "/ml-health", destination: `${fastApi}/` },
    ];
  },
};

export default nextConfig;
