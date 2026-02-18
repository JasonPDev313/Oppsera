import { config } from 'dotenv';
import { resolve } from 'path';
import type { NextConfig } from 'next';

// Load env from monorepo root (.env.local first, then .env fallback)
config({ path: resolve(__dirname, '../../.env.local') });
config({ path: resolve(__dirname, '../../.env') });

const nextConfig: NextConfig = {
  transpilePackages: ['@oppsera/shared', '@oppsera/core'],
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['@oppsera/shared', '@oppsera/core', 'lucide-react'],
  },
};

export default nextConfig;
