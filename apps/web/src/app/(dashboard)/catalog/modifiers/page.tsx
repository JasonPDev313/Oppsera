'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ModifiersContent = dynamic(() => import('./modifiers-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function ModifiersPage() {
  return <ModifiersContent />;
}
