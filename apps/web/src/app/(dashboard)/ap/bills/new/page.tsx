'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const BillFormContent = dynamic(() => import('./bill-form-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function NewBillPage() {
  return <BillFormContent />;
}
