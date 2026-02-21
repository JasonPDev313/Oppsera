'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const BanksContent = dynamic(() => import('./banks-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function BankAccountsPage() {
  return <BanksContent />;
}
