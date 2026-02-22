'use client';

import dynamic from 'next/dynamic';

const MemberPortalContent = dynamic(
  () => import('./member-portal-content'),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    ),
  },
);

export default function MemberPortalPage() {
  return <MemberPortalContent />;
}
