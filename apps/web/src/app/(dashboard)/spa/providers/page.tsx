'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ProvidersContent = dynamic(() => import('./providers-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function SpaProvidersPage() {
  return <ProvidersContent />;
}
