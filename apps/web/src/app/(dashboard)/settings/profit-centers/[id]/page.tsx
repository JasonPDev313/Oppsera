'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const TerminalsContent = dynamic(() => import('./terminals-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function TerminalsPage() {
  return <TerminalsContent />;
}
