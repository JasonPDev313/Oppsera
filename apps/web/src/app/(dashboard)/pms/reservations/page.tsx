'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ReservationsContent = dynamic(() => import('./reservations-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function ReservationsPage() {
  return <ReservationsContent />;
}
