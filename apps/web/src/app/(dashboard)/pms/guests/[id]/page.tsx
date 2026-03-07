'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const GuestDetailContent = dynamic(
  () => import('./guest-detail-content'),
  {
    loading: () => <PageSkeleton rows={8} />,
    ssr: false,
  },
);

export default function GuestDetailPage() {
  return <GuestDetailContent />;
}
