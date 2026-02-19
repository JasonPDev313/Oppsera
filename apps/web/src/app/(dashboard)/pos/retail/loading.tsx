/**
 * Retail POS loading skeleton — shown instantly while the page JS bundle loads.
 * Mirrors the actual page layout so the user sees the full POS structure
 * (including bottom action buttons) without waiting for the heavy bundle.
 */
export default function RetailPOSLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Register Tabs skeleton */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-gray-200 bg-surface px-2">
        <div className="h-7 w-20 animate-pulse rounded bg-gray-100" />
        <div className="h-7 w-7 animate-pulse rounded bg-gray-100" />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANEL (60%) */}
        <div className="flex w-[60%] flex-col border-r border-gray-200 bg-surface">
          {/* Search bar */}
          <div className="shrink-0 border-b border-gray-100 px-4 py-3">
            <div className="h-10 w-full animate-pulse rounded-lg bg-gray-100" />
          </div>

          {/* View mode tabs */}
          <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-2">
            <div className="h-8 w-20 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-8 w-24 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-8 w-16 animate-pulse rounded-lg bg-gray-100" />
          </div>

          {/* Department tabs */}
          <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-24 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>

          {/* Item grid */}
          <div className="flex-1 overflow-hidden p-4">
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL (40%) */}
        <div className="flex w-[40%] flex-col bg-surface">
          {/* Customer attachment */}
          <div className="shrink-0 border-b border-gray-200 px-4 py-3">
            <div className="h-8 w-40 animate-pulse rounded-lg bg-gray-100" />
          </div>

          {/* Cart area */}
          <div className="flex-1 overflow-hidden px-4 py-3">
            <div className="h-5 w-16 animate-pulse rounded bg-gray-100" />
          </div>

          {/* Cart totals */}
          <div className="shrink-0 border-t border-gray-200 px-4 py-3">
            <div className="space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-12 animate-pulse rounded bg-gray-100" />
              </div>
              <div className="flex justify-between">
                <div className="h-5 w-12 animate-pulse rounded bg-gray-200" />
                <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />
              </div>
            </div>
          </div>

          {/* Discount + Service Charge + Tax Exempt */}
          <div className="shrink-0 border-t border-gray-200 px-4 py-2">
            <div className="flex gap-2">
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-400">
                Discount
              </div>
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-400">
                Service Charge
              </div>
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-400">
                Tax Exempt
              </div>
            </div>
          </div>

          {/* Send + Pay */}
          <div className="shrink-0 px-4 py-2">
            <div className="flex gap-2">
              <div className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-base font-semibold text-gray-400">
                Send
              </div>
              <div className="flex flex-[1.5] items-center justify-center gap-2 rounded-lg bg-indigo-300 px-4 py-3 text-base font-semibold text-white">
                Pay
              </div>
            </div>
          </div>

          {/* Hold / Recall / Void */}
          <div className="shrink-0 border-t border-gray-100 px-4 py-2">
            <div className="flex gap-2">
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 py-2 text-sm font-medium text-gray-400">
                Hold
              </div>
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 py-2 text-sm font-medium text-gray-400">
                Recall
              </div>
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/20 px-2 py-2 text-sm font-medium text-red-300">
                Void
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
