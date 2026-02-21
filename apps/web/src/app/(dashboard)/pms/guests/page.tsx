'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const GuestsContent = dynamic(() => import('./guests-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function PmsGuestsPage() {
  return <GuestsContent />;
}
