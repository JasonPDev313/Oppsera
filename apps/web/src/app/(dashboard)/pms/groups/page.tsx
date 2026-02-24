'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const GroupsContent = dynamic(() => import('./groups-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function PMSGroupsPage() {
  return <GroupsContent />;
}
