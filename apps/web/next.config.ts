import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@oppsera/shared', '@oppsera/core'],
};

export default nextConfig;
