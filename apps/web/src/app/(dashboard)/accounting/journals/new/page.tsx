'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const JournalEntryFormContent = dynamic(() => import('./journal-entry-form-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function NewJournalEntryPage() {
  return <JournalEntryFormContent />;
}
