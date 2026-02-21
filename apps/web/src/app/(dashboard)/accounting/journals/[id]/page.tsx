'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const JournalDetailContent = dynamic(() => import('./journal-detail-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function JournalDetailPage() {
  return <JournalDetailContent />;
}
