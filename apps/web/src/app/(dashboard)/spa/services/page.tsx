'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ServicesContent = dynamic(() => import('./services-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function SpaServicesPage() {
  return <ServicesContent />;
}
