'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const CloseContent = dynamic(() => import('./close-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function RetailClosePage() {
  return <CloseContent />;
}
