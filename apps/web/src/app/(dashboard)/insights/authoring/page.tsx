'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const AuthoringContent = dynamic(() => import('./authoring-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function AuthoringPage() {
  return <AuthoringContent />;
}
