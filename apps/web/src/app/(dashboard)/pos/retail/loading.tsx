/**
 * Retail POS loading skeleton — shown instantly while the page JS bundle loads.
 * Mirrors the actual page layout so the user sees the full POS structure
 * (including bottom action buttons) without waiting for the heavy bundle.
 */
export default function RetailPOSLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Register Tabs skeleton */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-surface px-2">
        <div className="h-7 w-20 animate-pulse rounded bg-muted" />
        <div className="h-7 w-7 animate-pulse rounded bg-muted" />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANEL (60%) */}
        <div className="flex w-[60%] flex-col border-r border-border bg-surface">
          {/* Search bar */}
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
          </div>

          {/* View mode tabs */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
            <div className="h-8 w-20 animate-pulse rounded-lg bg-muted" />
            <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
            <div className="h-8 w-16 animate-pulse rounded-lg bg-muted" />
          </div>

          {/* Department tabs */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>

          {/* Item grid */}
          <div className="flex-1 overflow-hidden p-4">
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL (40%) */}
        <div className="flex w-[40%] flex-col bg-surface">
          {/* Customer attachment */}
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
          </div>

          {/* Cart area */}
          <div className="flex-1 overflow-hidden px-4 py-3">
            <div className="h-5 w-16 animate-pulse rounded bg-muted" />
          </div>

          {/* Cart totals */}
          <div className="shrink-0 border-t border-border px-4 py-3">
            <div className="space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                <div className="h-4 w-12 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex justify-between">
                <div className="h-5 w-12 animate-pulse rounded bg-muted" />
                <div className="h-5 w-16 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>

          {/* Discount + Service Charge + Tax Exempt */}
          <div className="shrink-0 border-t border-border px-4 py-2">
            <div className="flex gap-2">
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground">
                Discount
              </div>
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground">
                Service Charge
              </div>
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground">
                Tax Exempt
              </div>
            </div>
          </div>

          {/* Send + Pay */}
          <div className="shrink-0 px-4 py-2">
            <div className="flex gap-2">
              <div className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-base font-semibold text-muted-foreground">
                Send
              </div>
              <div className="flex flex-[1.5] items-center justify-center gap-2 rounded-lg bg-indigo-300 px-4 py-3 text-base font-semibold text-white">
                Pay
              </div>
            </div>
          </div>

          {/* Hold / Recall / Void */}
          <div className="shrink-0 border-t border-border px-4 py-2">
            <div className="flex gap-2">
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-sm font-medium text-muted-foreground">
                Hold
              </div>
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-sm font-medium text-muted-foreground">
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
