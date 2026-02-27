'use client';

import dynamic from 'next/dynamic';

const EmbedWidgetRenderer = dynamic(() => import('./embed-widget-renderer'), {
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-transparent">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  ),
  ssr: false,
});

export default function EmbedPage() {
  return <EmbedWidgetRenderer />;
}
