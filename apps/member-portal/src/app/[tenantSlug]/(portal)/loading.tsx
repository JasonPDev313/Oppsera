export default function PortalLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mt-2" />
        </div>
        <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 bg-gray-100 rounded-lg animate-pulse border border-gray-200" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="h-24 bg-gray-100 rounded-lg animate-pulse border border-gray-200" />
      <div className="h-48 bg-gray-100 rounded-lg animate-pulse border border-gray-200" />
    </div>
  );
}
