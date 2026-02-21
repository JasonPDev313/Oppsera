export default function EditorLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Toolbar skeleton */}
      <div className="flex h-12 items-center justify-between border-b border-gray-200 px-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-gray-200 animate-pulse" />
          <div className="h-5 w-32 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-gray-200 animate-pulse" />
          <div className="h-6 w-6 rounded bg-gray-200 animate-pulse" />
          <div className="h-6 w-16 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-20 rounded bg-gray-200 animate-pulse" />
          <div className="h-7 w-20 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
      {/* Body skeleton */}
      <div className="flex flex-1">
        <div className="w-60 border-r border-gray-200 p-3 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-gray-200 animate-pulse" />
          ))}
        </div>
        <div className="flex-1 bg-gray-100" />
        <div className="w-70 border-l border-gray-200 p-3 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
