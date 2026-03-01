'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const BookingContent = dynamic(() => import('./booking-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function SpaBookingPage() {
  return <BookingContent />;
}
