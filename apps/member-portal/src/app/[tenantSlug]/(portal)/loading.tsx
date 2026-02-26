export default function PortalLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 bg-muted rounded animate-pulse" />
          <div className="h-4 w-32 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="h-6 w-16 bg-muted rounded-full animate-pulse" />
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 bg-muted rounded-lg animate-pulse border border-border" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="h-24 bg-muted rounded-lg animate-pulse border border-border" />
      <div className="h-48 bg-muted rounded-lg animate-pulse border border-border" />
    </div>
  );
}
