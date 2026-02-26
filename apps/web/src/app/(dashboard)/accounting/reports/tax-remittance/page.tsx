'use client';

import dynamic from 'next/dynamic';

const TaxRemittanceContent = dynamic(() => import('./tax-remittance-content'), {
  loading: () => (
    <div className="space-y-6">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  ),
  ssr: false,
});

export default function TaxRemittancePage() {
  return <TaxRemittanceContent />;
}
