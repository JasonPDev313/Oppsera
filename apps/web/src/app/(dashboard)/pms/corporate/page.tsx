'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const CorporateContent = dynamic(() => import('./corporate-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function PMSCorporatePage() {
  return <CorporateContent />;
}
