'use client';

import type { KdsView } from '@/types/fnb';

interface AllDaySummaryProps {
  kdsView: KdsView;
}

export function AllDaySummary({ kdsView }: AllDaySummaryProps) {
  // Aggregate item counts across all active tickets
  const counts: Record<string, number> = {};
  for (const ticket of kdsView.tickets) {
    for (const item of ticket.items) {
      if (item.itemStatus === 'voided') continue;
      const key = item.itemName;
      counts[key] = (counts[key] ?? 0) + item.quantity;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  return (
    <div
      className="border-t px-3 py-2 shrink-0"
      style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-elevated)' }}
    >
      <span className="text-[10px] font-bold uppercase mb-1 block" style={{ color: 'var(--fnb-text-muted)' }}>
        All Day
      </span>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {sorted.slice(0, 12).map(([name, count]) => (
          <span key={name} className="text-xs" style={{ color: 'var(--fnb-text-secondary)' }}>
            <span className="font-bold fnb-mono" style={{ color: 'var(--fnb-text-primary)' }}>{count}</span>
            {' '}{name}
          </span>
        ))}
        {sorted.length > 12 && (
          <span className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
            +{sorted.length - 12} more
          </span>
        )}
      </div>
    </div>
  );
}
