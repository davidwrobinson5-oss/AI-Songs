import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), microphone=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers: async () => [
    {
      source: '/:path*',
      headers: securityHeaders,
    },
    {
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store, max-age=0' },
        { key: 'Pragma', value: 'no-cache' },
      ],
    },
  ],
};

export default nextConfig;
