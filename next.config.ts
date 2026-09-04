import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';
const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const mobileCaptureUploadEdge = 'https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-mobile-process';

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
  ...(!clerkConfigured ? [{ key: 'Content-Security-Policy', value: contentSecurityPolicy }] : []),
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), microphone=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Android historically posts a complete recording to this Pie URL. Route that
  // request before the Next.js filesystem so large recordings do not enter a
  // Vercel Function body, which has a much smaller payload ceiling. The Supabase
  // edge endpoint authenticates the capture id + one-time capture secret and
  // writes the recording straight to Pie storage.
  rewrites: async () => ({
    beforeFiles: [
      { source: '/api/sheets/mobile-process', destination: mobileCaptureUploadEdge },
    ],
    afterFiles: [],
    fallback: [],
  }),
  headers: async () => [
    { source: '/:path*', headers: securityHeaders },
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
