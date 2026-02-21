'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ReceiptsContent = dynamic(() => import('./receipts-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function ARReceiptsPage() {
  return <ReceiptsContent />;
}
