'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const VendorDetailContent = dynamic(() => import('./vendor-detail-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function VendorDetailPage() {
  return <VendorDetailContent />;
}
