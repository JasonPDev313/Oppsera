import { config } from 'dotenv';
import { resolve } from 'path';
import type { NextConfig } from 'next';

// Load env from monorepo root (.env.local first, then .env fallback)
config({ path: resolve(__dirname, '../../.env.local') });
config({ path: resolve(__dirname, '../../.env') });

const isDev = process.env.NODE_ENV === 'development';

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspDirectives.join('; ') },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig: NextConfig = {
  transpilePackages: [
    '@oppsera/core',
    '@oppsera/db',
    '@oppsera/shared',
    '@oppsera/module-membership',
    '@oppsera/module-customers',
  ],
  poweredByHeader: false,
  // Prevent VSCode file watcher from racing with webpack cache writes on Windows
  webpack: (config) => {
    const prev = config.watchOptions ?? {};
    const existing = prev.ignored;
    const kept: string[] = [];
    if (Array.isArray(existing)) {
      for (const p of existing) {
        if (typeof p === 'string') kept.push(p);
      }
    } else if (typeof existing === 'string') {
      kept.push(existing);
    }
    kept.push('**/.next/**', '**/node_modules/**', '**/.git/**', '**/.turbo/**', '**/coverage/**');
    config.watchOptions = {
      ...prev,
      ignored: kept,
      aggregateTimeout: 300,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
