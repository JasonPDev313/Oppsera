'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const MappingsContent = dynamic(() => import('./mappings-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function MappingsPage() {
  return <MappingsContent />;
}
