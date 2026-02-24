'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const LoyaltyContent = dynamic(() => import('./loyalty-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function PMSLoyaltyPage() {
  return <LoyaltyContent />;
}
