'use client';

import dynamic from 'next/dynamic';

const CustomerDisplayContent = dynamic(
  () => import('./customer-display-content'),
  { ssr: false, loading: () => <div className="flex h-screen items-center justify-center bg-background"><p className="text-xl text-muted-foreground">Loading display...</p></div> },
);

export default function CustomerDisplayPage() {
  return <CustomerDisplayContent />;
}
