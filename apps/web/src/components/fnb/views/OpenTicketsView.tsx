'use client';

import { useState, useEffect } from 'react';
import { Clock, Users, ChevronRight } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import type { FnbTabListItem } from '@/types/fnb';

function formatElapsed(openedAt: string): string {
  const minutes = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function OpenTicketsView({ userId: _userId }: { userId: string }) {
  const [tabs, setTabs] = useState<FnbTabListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigateTo = useFnbPosStore((s) => s.navigateTo);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch<{ data: FnbTabListItem[] }>('/api/v1/fnb/tabs?status=open');
        if (!cancelled) setTabs(res.data ?? []);
      } catch {
        // Silently handle — list stays empty
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
          No open tickets
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3" style={{ backgroundColor: 'var(--fnb-bg-base)' }}>
      <div className="grid gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigateTo('tab', { tabId: tab.id })}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--fnb-bg-surface)', border: 'var(--fnb-border-subtle)' }}
          >
            {/* Table / Tab badge */}
            <div
              className="flex items-center justify-center rounded-lg font-black text-lg min-w-[48px] h-10"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-primary)' }}
            >
              {tab.tableNumber ? `T${tab.tableNumber}` : `#${tab.tabNumber}`}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {tab.serverName && (
                  <span className="text-xs truncate" style={{ color: 'var(--fnb-text-secondary)' }}>
                    {tab.serverName}
                  </span>
                )}
                {tab.guestName && (
                  <span className="text-xs truncate" style={{ color: 'var(--fnb-text-muted)' }}>
                    {tab.guestName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {tab.partySize && (
                  <div className="flex items-center gap-0.5" style={{ color: 'var(--fnb-text-muted)' }}>
                    <Users className="h-3 w-3" />
                    <span className="text-[10px]">{tab.partySize}</span>
                  </div>
                )}
                <div className="flex items-center gap-0.5" style={{ color: 'var(--fnb-text-muted)' }}>
                  <Clock className="h-3 w-3" />
                  <span className="text-[10px]">{formatElapsed(tab.openedAt)}</span>
                </div>
              </div>
            </div>

            {/* Total */}
            <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              {formatMoney(tab.totalCents)}
            </span>

            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fnb-text-muted)' }} />
          </button>
        ))}
      </div>
    </div>
  );
}
