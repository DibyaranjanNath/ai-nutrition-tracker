import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Raise this for high-res photos
       // It allows your specific GitHub URL to talk to the server.
      allowedOrigins: [
        "bug-free-space-barnacle-wg44xr7v75p295xx-3000.app.github.dev",
        "localhost:3000"
      ]
    },
  },
};

export default nextConfig;