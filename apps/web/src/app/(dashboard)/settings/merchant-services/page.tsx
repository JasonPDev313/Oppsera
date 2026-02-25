'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const MerchantServicesContent = dynamic(() => import('./merchant-services-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function MerchantServicesPage() {
  return <MerchantServicesContent />;
}
