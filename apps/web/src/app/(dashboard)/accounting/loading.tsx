import { PageSkeleton } from '@/components/ui/page-skeleton';

export default function AccountingLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-52 animate-pulse rounded bg-gray-200" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-surface p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
            <div className="mt-3 h-7 w-32 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>

      {/* Quick links + recent */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-5 w-36 animate-pulse rounded bg-gray-200" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-100 p-4">
              <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
              <div className="ml-auto h-4 w-20 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
