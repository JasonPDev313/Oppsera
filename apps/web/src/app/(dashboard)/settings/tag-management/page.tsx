'use client';

import dynamic from 'next/dynamic';

const TagManagementContent = dynamic(
  () => import('./tag-management-content').then((m) => m.TagManagementContent),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-6 p-6">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-10 w-32 rounded-lg bg-muted" />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-lg bg-muted" />
          ))}
        </div>

        {/* Table rows */}
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    ),
  },
);

export default function TagManagementPage() {
  return <TagManagementContent />;
}
