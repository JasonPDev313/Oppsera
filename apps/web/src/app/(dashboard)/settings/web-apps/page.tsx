'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const WebAppsContent = dynamic(() => import('./web-apps-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function WebAppsPage() {
  return <WebAppsContent />;
}
