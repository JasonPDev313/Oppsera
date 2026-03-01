'use client';

import dynamic from 'next/dynamic';

const AppointmentDetailContent = dynamic(
  () => import('./appointment-detail-content'),
  { ssr: false, loading: () => <DetailSkeleton /> },
);

function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-surface rounded" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-48 bg-surface rounded-lg border border-border" />
          <div className="h-48 bg-surface rounded-lg border border-border" />
        </div>
        <div className="space-y-4">
          <div className="h-32 bg-surface rounded-lg border border-border" />
          <div className="h-32 bg-surface rounded-lg border border-border" />
        </div>
      </div>
    </div>
  );
}

export default function AppointmentDetailPage() {
  return <AppointmentDetailContent />;
}
