'use client';

import { Clock, User, MapPin, AlertTriangle } from 'lucide-react';

interface ManageTabCardProps {
  tab: {
    id: string;
    tabNumber: number;
    guestName: string | null;
    tableLabel: string | null;
    serverName: string | null;
    status: string;
    openedAt: string;
    orderTotal: number | null;
    balance: number | null;
    openDurationMinutes: number | null;
  };
  selected: boolean;
  onToggle: (id: string) => void;
  isStale?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'var(--fnb-status-available)',
  ordering: 'var(--fnb-status-occupied)',
  sent_to_kitchen: '#f59e0b',
  in_progress: '#3b82f6',
  check_requested: '#8b5cf6',
  split: '#14b8a6',
  paying: '#ec4899',
  abandoned: '#d97706',
  closed: 'var(--fnb-text-muted)',
  voided: 'var(--fnb-status-dirty)',
};

function formatMoney(cents: number | null): string {
  if (cents == null) return '$0.00';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return '--';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function ManageTabCard({ tab, selected, onToggle, isStale }: ManageTabCardProps) {
  const statusColor = STATUS_COLORS[tab.status] ?? 'var(--fnb-text-muted)';

  return (
    <button
      onClick={() => onToggle(tab.id)}
      className="w-full text-left rounded-lg p-3 transition-colors cursor-pointer"
      style={{
        background: selected ? 'var(--fnb-accent-primary-muted)' : 'var(--fnb-bg-elevated)',
        border: selected
          ? '2px solid var(--fnb-accent-primary)'
          : isStale
            ? '2px solid #d97706'
            : '2px solid transparent',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="pt-0.5">
          <div
            className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
            style={{
              borderColor: selected ? 'var(--fnb-accent-primary)' : 'var(--fnb-border-subtle)',
              background: selected ? 'var(--fnb-accent-primary)' : 'transparent',
            }}
          >
            {selected && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-base font-bold"
              style={{ color: 'var(--fnb-text-primary)' }}
            >
              #{tab.tabNumber}
            </span>
            {isStale && <AlertTriangle size={12} style={{ color: '#d97706' }} aria-label="Tab modified elsewhere" />}
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wide"
              style={{
                color: statusColor,
                background: `color-mix(in srgb, ${statusColor} 15%, transparent)`,
              }}
            >
              {tab.status.replace(/_/g, ' ')}
            </span>
          </div>

          {tab.guestName && (
            <div
              className="text-sm truncate mb-0.5"
              style={{ color: 'var(--fnb-text-primary)' }}
            >
              {tab.guestName}
            </div>
          )}

          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
            {tab.tableLabel && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {tab.tableLabel}
              </span>
            )}
            {tab.serverName && (
              <span className="flex items-center gap-1">
                <User size={11} />
                {tab.serverName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {formatDuration(tab.openDurationMinutes)}
            </span>
          </div>
        </div>

        {/* Balance */}
        <div className="text-right shrink-0">
          <div
            className="text-sm font-semibold tabular-nums"
            style={{ color: 'var(--fnb-text-primary)' }}
          >
            {formatMoney(tab.balance)}
          </div>
          {tab.orderTotal != null && tab.orderTotal !== tab.balance && (
            <div
              className="text-xs tabular-nums"
              style={{ color: 'var(--fnb-text-muted)' }}
            >
              of {formatMoney(tab.orderTotal)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
