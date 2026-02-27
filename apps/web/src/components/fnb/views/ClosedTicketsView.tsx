'use client';

import { useState, useEffect } from 'react';
import { Clock, Receipt } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { FnbTabListItem } from '@/types/fnb';

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ClosedTicketsView({ userId: _userId }: { userId: string }) {
  const [tabs, setTabs] = useState<FnbTabListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch<{ data: FnbTabListItem[] }>('/api/v1/fnb/tabs?status=closed');
        if (!cancelled) setTabs(res.data ?? []);
      } catch {
        // Silently handle
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (tabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
          No closed tickets today
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3" style={{ backgroundColor: 'var(--fnb-bg-base)' }}>
      <div className="grid gap-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5"
            style={{ backgroundColor: 'var(--fnb-bg-surface)', border: 'var(--fnb-border-subtle)', opacity: 0.8 }}
          >
            {/* Icon */}
            <div
              className="flex items-center justify-center rounded-lg min-w-[40px] h-9"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
            >
              <Receipt className="h-4 w-4" style={{ color: 'var(--fnb-text-muted)' }} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>
                  {tab.tableNumber ? `Table ${tab.tableNumber}` : `Tab #${tab.tabNumber}`}
                </span>
                {tab.serverName && (
                  <span className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
                    {tab.serverName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--fnb-text-muted)' }}>
                <Clock className="h-3 w-3" />
                <span className="text-[10px]">{formatTime(tab.openedAt)}</span>
              </div>
            </div>

            {/* Total */}
            <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              {formatMoney(tab.totalCents)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
