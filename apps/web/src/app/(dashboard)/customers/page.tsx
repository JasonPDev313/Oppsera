'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const CustomersContent = dynamic(() => import('./customers-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function CustomersPage() {
  return <CustomersContent />;
}
