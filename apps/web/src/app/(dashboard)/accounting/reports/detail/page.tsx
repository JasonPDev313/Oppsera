'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const GLDetailContent = dynamic(() => import('./gl-detail-content'), {
  loading: () => <PageSkeleton rows={10} />,
  ssr: false,
});

export default function GLDetailPage() {
  return <GLDetailContent />;
}
