'use client';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400',
  trial: 'bg-amber-500/20 text-amber-400',
  suspended: 'bg-red-500/20 text-red-400',
};

export function TenantStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-slate-500/20 text-slate-400';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  );
}
