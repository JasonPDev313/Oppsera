'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const EmbedsContent = dynamic(() => import('./embeds-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function EmbedsPage() {
  return <EmbedsContent />;
}
