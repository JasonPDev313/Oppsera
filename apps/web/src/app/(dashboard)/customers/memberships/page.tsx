'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const MembershipsContent = dynamic(() => import('./memberships-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function MembershipPlansPage() {
  return <MembershipsContent />;
}
