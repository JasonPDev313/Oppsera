'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const SettingsContent = dynamic(() => import('./settings-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function SpaSettingsPage() {
  return <SettingsContent />;
}
