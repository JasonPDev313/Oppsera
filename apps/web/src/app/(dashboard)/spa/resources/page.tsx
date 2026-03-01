'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ResourcesContent = dynamic(() => import('./resources-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function SpaResourcesPage() {
  return <ResourcesContent />;
}
