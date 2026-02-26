export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-28 animate-pulse rounded bg-muted" />
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {['Roles', 'Modules', 'Audit Log', 'Dashboard'].map((t) => (
          <div key={t} className="px-4 py-2 text-sm font-medium text-muted-foreground">{t}</div>
        ))}
      </div>
      {/* Content area */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-64 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
