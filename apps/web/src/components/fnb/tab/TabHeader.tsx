'use client';

import { ArrowLeft, Clock, Users, Flame, CheckCircle2 } from 'lucide-react';
import type { FnbTabDetail } from '@/types/fnb';

function getFireStatus(tab: FnbTabDetail): { label: string; color: string; bg: string; icon: 'flame' | 'check' } | null {
  const lines = tab.lines ?? [];
  const courses = tab.courses ?? [];
  if (lines.length === 0) return null;

  const unsentCount = lines.filter((l) => l.status === 'draft' || l.status === 'unsent').length;
  if (unsentCount > 0) {
    return { label: `${unsentCount} unsent`, color: 'var(--fnb-warning)', bg: 'rgba(245,158,11,0.12)', icon: 'flame' };
  }

  const firingCount = courses.filter((c) => c.courseStatus === 'fired' || c.courseStatus === 'cooking').length;
  if (firingCount > 0) {
    return { label: `${firingCount} firing`, color: 'var(--fnb-action-fire)', bg: 'rgba(249,115,22,0.12)', icon: 'flame' };
  }

  const allServed = courses.length > 0 && courses.every((c) => c.courseStatus === 'served');
  if (allServed) {
    return { label: 'All served', color: 'var(--fnb-status-available)', bg: 'rgba(34,197,94,0.12)', icon: 'check' };
  }

  return null;
}

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
  const fireStatus = getFireStatus(tab);

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
          <span
            className="text-2xl font-black tracking-tight rounded-lg px-2 py-0.5"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-primary)' }}
          >
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
          {fireStatus && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1"
              style={{ backgroundColor: fireStatus.bg, color: fireStatus.color }}
            >
              {fireStatus.icon === 'flame' ? <Flame className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              {fireStatus.label}
            </span>
          )}
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
