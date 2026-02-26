/**
 * Sales History loading skeleton — shown instantly while the page JS bundle loads.
 */
export default function OrdersLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 animate-pulse rounded bg-muted" />
        <div className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
      </div>

      {/* Summary bar */}
      <div className="flex gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex flex-1 flex-col gap-1 rounded-lg border border-border bg-surface p-3"
          >
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-44 animate-pulse rounded-lg bg-muted" />
        <div className="flex items-center gap-2">
          <div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-3 animate-pulse rounded bg-muted" />
          <div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {/* Table header */}
        <div className="flex items-center gap-3 border-b border-border bg-muted px-4 py-3">
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-14 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-14 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
        {/* Table rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-border px-4 py-3"
          >
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-14 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-6 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
