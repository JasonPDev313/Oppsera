'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ItemEditContent = dynamic(() => import('./item-edit-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function EditItemPage() {
  return <ItemEditContent />;
}
