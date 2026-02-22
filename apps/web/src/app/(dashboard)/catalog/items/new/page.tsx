'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const CreateItemContent = dynamic(() => import('./create-item-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function CreateItemPage() {
  return <CreateItemContent />;
}
