'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ToolsContent = dynamic(() => import('./tools-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function ToolsPage() {
  return <ToolsContent />;
}
