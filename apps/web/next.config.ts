import { config } from 'dotenv';
import { resolve } from 'path';
import withBundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

// Load env from monorepo root (.env.local first, then .env fallback)
config({ path: resolve(__dirname, '../../.env.local') });
config({ path: resolve(__dirname, '../../.env') });

const isDev = process.env.NODE_ENV === 'development';

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://pay.google.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.cardconnect.com",
  "frame-src https://*.cardconnect.com",
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
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
  transpilePackages: ['@oppsera/shared', '@oppsera/core', '@oppsera/module-import'],
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['@oppsera/shared', '@oppsera/core', '@oppsera/module-import', 'lucide-react'],
  },
  // Webpack watcher config (production builds only — Turbopack ignores this in dev).
  // Uses native FS events (no polling) with broad ignore patterns to reduce overhead.
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
  async redirects() {
    return [
      // GL section
      { source: '/accounting/accounts', destination: '/accounting/gl?tab=chart-of-accounts', permanent: false },
      { source: '/accounting/journals', destination: '/accounting/gl?tab=journal-entries', permanent: false },
      { source: '/accounting/mappings', destination: '/accounting/gl?tab=gl-mappings', permanent: false },
      // AP section
      { source: '/ap/bills', destination: '/accounting/payables?tab=bills', permanent: false },
      { source: '/ap/payments', destination: '/accounting/payables?tab=payments', permanent: false },
      // AR section
      { source: '/ar/invoices', destination: '/accounting/receivables?tab=invoices', permanent: false },
      { source: '/ar/receipts', destination: '/accounting/receivables?tab=receipts', permanent: false },
      // Banking
      { source: '/accounting/banks', destination: '/accounting/banking?tab=bank-accounts', permanent: false },
      { source: '/accounting/deposits', destination: '/accounting/banking?tab=deposits', permanent: false },
      { source: '/accounting/reconciliation', destination: '/accounting/banking?tab=reconciliation', permanent: false },
      { source: '/accounting/settlements', destination: '/accounting/banking?tab=settlements', permanent: false },
      // Revenue & Cost
      { source: '/accounting/cogs', destination: '/accounting/revenue?tab=cogs', permanent: false },
      { source: '/accounting/tip-payouts', destination: '/accounting/revenue?tab=tip-payouts', permanent: false },
      // Tax
      { source: '/accounting/reports/sales-tax', destination: '/accounting/tax?tab=remittance', permanent: false },
      // Financials
      { source: '/accounting/reports/trial-balance', destination: '/accounting/financials?tab=reports', permanent: false },
      { source: '/accounting/statements/profit-loss', destination: '/accounting/financials?tab=statements', permanent: false },
      // Period Close
      { source: '/operations/close-dashboard', destination: '/accounting/period-close?tab=close-dashboard', permanent: false },
      { source: '/accounting/close', destination: '/accounting/period-close?tab=period-close', permanent: false },
    ];
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

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default analyzer(nextConfig);
