'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const HierarchyContent = dynamic(() => import('./hierarchy-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function HierarchyPage() {
  return <HierarchyContent />;
}
