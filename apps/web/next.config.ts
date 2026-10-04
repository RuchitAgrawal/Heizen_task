import type { NextConfig } from 'next';

// The browser only ever talks to this origin. /api/* is proxied to the NestJS API,
// so the session cookie is first-party and no CORS is needed.
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  devIndicators: { position: 'bottom-right' },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
