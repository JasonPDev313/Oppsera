'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ReservationDetailContent = dynamic(
  () => import('./reservation-detail-content'),
  {
    loading: () => <PageSkeleton rows={10} />,
    ssr: false,
  },
);

export default function ReservationDetailPage() {
  return <ReservationDetailContent />;
}
