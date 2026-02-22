'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const PlansContent = dynamic(() => import('./plans-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function MembershipPlansV2Page() {
  return <PlansContent />;
}
