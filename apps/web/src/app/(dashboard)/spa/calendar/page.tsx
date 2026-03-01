'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const CalendarContent = dynamic(() => import('./calendar-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function SpaCalendarPage() {
  return <CalendarContent />;
}
