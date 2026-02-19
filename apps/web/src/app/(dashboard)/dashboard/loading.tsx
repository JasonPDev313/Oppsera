/**
 * Dashboard loading skeleton — shown instantly while the page JS bundle loads.
 * Mirrors the actual dashboard layout (header, 4 KPI cards, orders list, notes).
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded bg-gray-100" />
        </div>
        <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-100" />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-gray-950/5">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 animate-pulse rounded-lg bg-gray-100" />
              <div>
                <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
                <div className="mt-2 h-7 w-20 animate-pulse rounded bg-gray-200" />
                <div className="mt-1.5 h-3 w-16 animate-pulse rounded bg-gray-100" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Orders */}
        <div className="lg:col-span-2">
          <div className="rounded-xl bg-surface shadow-sm ring-1 ring-gray-950/5">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-14 animate-pulse rounded bg-gray-100" />
            </div>
            <div className="divide-y divide-gray-50">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 animate-pulse rounded-lg bg-gray-100" />
                    <div>
                      <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
                      <div className="mt-1 h-3 w-20 animate-pulse rounded bg-gray-100" />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="h-4 w-14 animate-pulse rounded bg-gray-200" />
                    <div className="mt-1 h-4 w-10 animate-pulse rounded-full bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Notes */}
        <div>
          <div className="rounded-xl bg-surface shadow-sm ring-1 ring-gray-950/5">
            <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
              <div className="h-4 w-4 animate-pulse rounded bg-gray-100" />
              <div className="h-5 w-12 animate-pulse rounded bg-gray-200" />
            </div>
            <div className="p-4">
              <div className="h-28 w-full animate-pulse rounded-lg bg-gray-100" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
