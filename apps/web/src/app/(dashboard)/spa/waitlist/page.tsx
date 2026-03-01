'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const WaitlistContent = dynamic(() => import('./waitlist-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function SpaWaitlistPage() {
  return <WaitlistContent />;
}
