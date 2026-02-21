'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const RoomsContent = dynamic(() => import('./rooms-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function RoomsPage() {
  return <RoomsContent />;
}
