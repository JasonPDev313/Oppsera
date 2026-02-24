'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const MerchantProcessingContent = dynamic(() => import('./merchant-processing-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function MerchantProcessingPage() {
  return <MerchantProcessingContent />;
}
