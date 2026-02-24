'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const WatchlistContent = dynamic(() => import('./watchlist-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function WatchlistPage() {
  return <WatchlistContent />;
}
