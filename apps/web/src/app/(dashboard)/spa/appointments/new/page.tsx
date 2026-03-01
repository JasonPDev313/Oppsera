'use client';
import dynamic from 'next/dynamic';

const NewAppointmentContent = dynamic(
  () => import('./new-appointment-content'),
  { ssr: false, loading: () => <BookingSkeleton /> }
);

function BookingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-surface rounded" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-64 bg-surface rounded-lg border border-border" />
          <div className="h-48 bg-surface rounded-lg border border-border" />
        </div>
        <div className="h-64 bg-surface rounded-lg border border-border" />
      </div>
    </div>
  );
}

export default function NewAppointmentPage() {
  return <NewAppointmentContent />;
}
