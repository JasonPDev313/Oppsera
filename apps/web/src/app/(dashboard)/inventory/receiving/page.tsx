'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ReceivingContent = dynamic(() => import('./receiving-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function ReceivingPage() {
  return <ReceivingContent />;
}
