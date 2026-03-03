'use client';

interface SnapshotDiffViewerProps {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export function SnapshotDiffViewer({ before, after }: SnapshotDiffViewerProps) {
  if (!before && !after) return null;

  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  // Only show fields that changed
  const changedFields = Array.from(allKeys).filter((key) => {
    const b = before?.[key];
    const a = after?.[key];
    return JSON.stringify(b) !== JSON.stringify(a);
  });

  if (changedFields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">No visible changes</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-border rounded">
        <thead>
          <tr className="bg-slate-800/50">
            <th className="text-left px-3 py-1.5 text-muted-foreground font-medium border-b border-border">
              Field
            </th>
            <th className="text-left px-3 py-1.5 text-muted-foreground font-medium border-b border-border">
              Before
            </th>
            <th className="text-left px-3 py-1.5 text-muted-foreground font-medium border-b border-border">
              After
            </th>
          </tr>
        </thead>
        <tbody>
          {changedFields.map((key) => (
            <tr key={key} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 text-muted-foreground font-mono">{key}</td>
              <td className="px-3 py-1.5 text-red-400 font-mono">
                {formatValue(before?.[key])}
              </td>
              <td className="px-3 py-1.5 text-green-400 font-mono">
                {formatValue(after?.[key])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
