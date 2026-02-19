/**
 * Generic page loading skeleton used as a fallback for dynamically
 * imported page content. Renders a header bar + content placeholder.
 */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 p-4">
            <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
            <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
            <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
