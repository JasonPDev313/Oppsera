'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const IntakeContent = dynamic(() => import('./intake-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function SpaIntakePage() {
  return <IntakeContent />;
}
