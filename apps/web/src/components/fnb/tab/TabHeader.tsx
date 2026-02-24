'use client';

import { ArrowLeft, Clock, Users } from 'lucide-react';
import type { FnbTabDetail } from '@/types/fnb';

interface TabHeaderProps {
  tab: FnbTabDetail;
  onBack: () => void;
}

function formatElapsed(openedAt: string): string {
  const minutes = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function TabHeader({ tab, onBack }: TabHeaderProps) {
  const typeLabels: Record<string, string> = {
    dine_in: 'Dine-In',
    bar_seating: 'Bar',
    delivery: 'Delivery',
  };

  return (
    <div
      className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 shrink-0"
      style={{ backgroundColor: 'var(--fnb-bg-surface)', borderBottom: 'var(--fnb-border-subtle)' }}
    >
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center justify-center rounded-lg fnb-touch-min transition-opacity hover:opacity-80"
        style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      {/* Table + Tab info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            {tab.tableNumber ? `T${tab.tableNumber}` : `#${tab.tabNumber}`}
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          >
            {typeLabels[tab.tabType] ?? tab.tabType}
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
            style={{ backgroundColor: 'var(--fnb-info)', color: '#fff' }}
          >
            {tab.status}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {tab.serverName && (
            <span className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
              {tab.serverName}
            </span>
          )}
          {tab.guestName && (
            <span className="text-xs" style={{ color: 'var(--fnb-text-secondary)' }}>
              {tab.guestName}
            </span>
          )}
        </div>
      </div>

      {/* Party size — hidden on very small screens */}
      {tab.partySize && (
        <div className="hidden sm:flex items-center gap-1" style={{ color: 'var(--fnb-text-secondary)' }}>
          <Users className="h-3.5 w-3.5" />
          <span className="text-sm font-semibold">{tab.partySize}</span>
        </div>
      )}

      {/* Timer */}
      <div className="flex items-center gap-1" style={{ color: 'var(--fnb-text-muted)' }}>
        <Clock className="h-3.5 w-3.5" />
        <span className="text-sm">{formatElapsed(tab.openedAt)}</span>
      </div>

      {/* Running total */}
      <div className="text-right">
        <span className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          {formatMoney(tab.runningTotalCents ?? 0)}
        </span>
      </div>
    </div>
  );
}
