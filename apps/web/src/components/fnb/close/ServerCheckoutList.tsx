'use client';

import { User, Check, Clock } from 'lucide-react';

interface ServerCheckout {
  id: string;
  serverUserId: string;
  serverName: string | null;
  status: string;
  tabCount: number;
  salesCents: number;
  tipsCents: number;
  cashOwedCents: number;
}

interface ServerCheckoutListProps {
  checkouts: ServerCheckout[];
  onBeginCheckout?: (serverUserId: string) => void;
}

export function ServerCheckoutList({ checkouts, onBeginCheckout }: ServerCheckoutListProps) {
  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
        <h3 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>Server Checkouts</h3>
      </div>
      <div className="divide-y" style={{ borderColor: 'rgba(148, 163, 184, 0.08)' }}>
        {checkouts.map((co) => (
          <div key={co.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" style={{ color: 'var(--fnb-text-muted)' }} />
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-primary)' }}>
                  {co.serverName ?? 'Unknown'}
                </span>
                <div className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
                  {co.tabCount} tabs · Sales: {formatMoney(co.salesCents)} · Tips: {formatMoney(co.tipsCents)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-mono font-bold"
                style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)' }}
              >
                {formatMoney(co.cashOwedCents)}
              </span>
              {co.status === 'completed' ? (
                <Check className="h-4 w-4" style={{ color: 'var(--fnb-status-available)' }} />
              ) : co.status === 'in_progress' ? (
                <Clock className="h-4 w-4" style={{ color: 'var(--fnb-status-check-presented)' }} />
              ) : onBeginCheckout ? (
                <button
                  type="button"
                  onClick={() => onBeginCheckout(co.serverUserId)}
                  className="rounded px-2 py-1 text-[10px] font-bold text-white"
                  style={{ backgroundColor: 'var(--fnb-status-seated)' }}
                >
                  Start
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {checkouts.length === 0 && (
          <div className="px-4 py-6 text-center">
            <span className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>No server checkouts</span>
          </div>
        )}
      </div>
    </div>
  );
}
