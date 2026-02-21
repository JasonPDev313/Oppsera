'use client';

import type { ExpoView } from '@/types/fnb';

interface ExpoHeaderProps {
  expoView: ExpoView;
}

export function ExpoHeader({ expoView }: ExpoHeaderProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3 border-b shrink-0"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        borderColor: 'rgba(148, 163, 184, 0.15)',
      }}
    >
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          Expo
        </h1>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        >
          {expoView.totalActiveTickets} active
        </span>
      </div>

      <div className="flex items-center gap-3">
        {expoView.ticketsAllReady > 0 && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-bold"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: 'var(--fnb-status-available)' }}
          >
            {expoView.ticketsAllReady} ready to serve
          </span>
        )}
      </div>
    </div>
  );
}
