'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const NavigationBuilderContent = dynamic(() => import('./navigation-builder-content'), {
  loading: () => <PageSkeleton rows={11} />,
  ssr: false,
});

export default function NavigationSettingsPage() {
  return <NavigationBuilderContent />;
}
