'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const ProjectsContent = dynamic(() => import('./projects-content'), {
  loading: () => <div className="animate-pulse space-y-4 p-6"><div className="h-8 w-48 rounded bg-muted" /><div className="h-10 w-full rounded bg-muted" /><div className="h-64 w-full rounded bg-muted" /></div>,
  ssr: false,
});

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="animate-pulse space-y-4 p-6"><div className="h-8 w-48 rounded bg-muted" /><div className="h-10 w-full rounded bg-muted" /><div className="h-64 w-full rounded bg-muted" /></div>}>
      <ProjectsContent />
    </Suspense>
  );
}
