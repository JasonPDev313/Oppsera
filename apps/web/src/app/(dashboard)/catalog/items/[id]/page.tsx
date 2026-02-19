'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ItemDetailContent = dynamic(() => import('./item-detail-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function ItemDetailPage() {
  return <ItemDetailContent />;
}
