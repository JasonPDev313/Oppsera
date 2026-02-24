'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const TransactionsContent = dynamic(() => import('./transactions-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function TransactionsPage() {
  return <TransactionsContent />;
}
