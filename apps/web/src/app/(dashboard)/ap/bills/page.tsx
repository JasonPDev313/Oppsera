'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const BillsContent = dynamic(() => import('./bills-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function APBillsPage() {
  return <BillsContent />;
}
