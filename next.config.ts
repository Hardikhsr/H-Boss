import type { NextConfig } from "next";

const BACKEND_URL = `http://127.0.0.1:${process.env.BACKEND_PORT || 4000}`;

const nextConfig: NextConfig = {
  /* config options here */
  distDir: '.next',
  reactCompiler: true,
  outputFileTracingRoot: __dirname,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: '/safety',
        destination: `${BACKEND_URL}/safety`,
      },
      {
        source: '/storage/:path*',
        destination: `${BACKEND_URL}/storage/:path*`,
      },
      {
        source: '/download-join',
        destination: `${BACKEND_URL}/download-join`,
      },
      // NOTE: socket.io clients connect directly to :4000, no proxy needed
    ];
  },
};

export default nextConfig;

