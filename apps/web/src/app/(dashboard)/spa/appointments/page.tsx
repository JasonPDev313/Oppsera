'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const AppointmentsContent = dynamic(() => import('./appointments-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function SpaAppointmentsPage() {
  return <AppointmentsContent />;
}
