'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const RoomTypesContent = dynamic(() => import('./room-types-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function RoomTypesPage() {
  return <RoomTypesContent />;
}
