'use client';

import dynamic from 'next/dynamic';

const GLContent = dynamic(() => import('./gl-content'), {
  loading: () => <div className="animate-pulse space-y-4 p-6"><div className="h-8 w-48 rounded bg-gray-200" /><div className="h-10 w-full rounded bg-gray-200" /><div className="h-64 w-full rounded bg-gray-200" /></div>,
  ssr: false,
});

export default function GLPage() {
  return <GLContent />;
}
