export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-28 animate-pulse rounded bg-gray-200" />
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {['Roles', 'Modules', 'Audit Log', 'Dashboard'].map((t) => (
          <div key={t} className="px-4 py-2 text-sm font-medium text-gray-400">{t}</div>
        ))}
      </div>
      {/* Content area */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-200 bg-surface p-4">
            <div className="h-10 w-10 animate-pulse rounded-full bg-gray-100" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-64 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
