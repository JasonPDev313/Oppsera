'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const VendorLedgerContent = dynamic(() => import('./vendor-ledger-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function VendorLedgerPage() {
  return <VendorLedgerContent />;
}
