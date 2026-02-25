'use client';

import dynamic from 'next/dynamic';

const GeneralInfoContent = dynamic(() => import('./general-info-content'), {
  loading: () => <GeneralInfoLoading />,
  ssr: false,
});

function GeneralInfoLoading() {
  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="h-16 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-surface p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-5 w-5 animate-pulse rounded bg-gray-200" />
            <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="space-y-1">
                <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
                <div className="h-9 animate-pulse rounded bg-gray-50" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GeneralInfoPage() {
  return <GeneralInfoContent />;
}
