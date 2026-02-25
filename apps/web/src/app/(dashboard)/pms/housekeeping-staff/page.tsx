'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const HousekeepingStaffContent = dynamic(
  () => import('./housekeeping-staff-content').then((m) => m.HousekeepingStaffContent),
  { loading: () => <PageSkeleton />, ssr: false },
);

export default function HousekeepingStaffPage() {
  return <HousekeepingStaffContent />;
}
