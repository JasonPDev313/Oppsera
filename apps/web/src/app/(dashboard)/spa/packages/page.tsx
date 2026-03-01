'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const PackagesContent = dynamic(() => import('./packages-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function SpaPackagesPage() {
  return <PackagesContent />;
}
