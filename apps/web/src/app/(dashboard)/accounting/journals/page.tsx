'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const JournalsContent = dynamic(() => import('./journals-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function JournalEntriesPage() {
  return <JournalsContent />;
}
