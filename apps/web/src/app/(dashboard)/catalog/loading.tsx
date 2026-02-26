/**
 * Catalog Items loading skeleton — shown instantly while the page JS bundle loads.
 * Mirrors the actual page layout so the user sees the structure immediately.
 */
export default function CatalogLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="h-9 w-24 animate-pulse rounded-lg bg-indigo-200" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {/* Table header */}
        <div className="flex items-center gap-4 border-b border-border bg-muted px-4 py-3">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 py-3"
          >
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-14 animate-pulse rounded bg-muted" />
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
            <div className="h-4 w-10 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
