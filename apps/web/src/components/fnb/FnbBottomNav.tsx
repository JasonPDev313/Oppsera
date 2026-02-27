'use client';

import { LayoutGrid, ListOrdered, ListChecks, BarChart3 } from 'lucide-react';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import type { FnbNavTab } from '@/types/fnb';

const NAV_ITEMS: { key: FnbNavTab; label: string; icon: typeof LayoutGrid }[] = [
  { key: 'tables', label: 'Tables', icon: LayoutGrid },
  { key: 'open_tickets', label: 'Open', icon: ListOrdered },
  { key: 'closed_tickets', label: 'Closed', icon: ListChecks },
  { key: 'sales', label: 'Sales', icon: BarChart3 },
];

export function FnbBottomNav() {
  const activeNavTab = useFnbPosStore((s) => s.activeNavTab);
  const currentScreen = useFnbPosStore((s) => s.currentScreen);
  const setNavTab = useFnbPosStore((s) => s.setNavTab);

  // Hide bottom nav when inside a tab, payment, or split view
  if (currentScreen === 'tab' || currentScreen === 'payment' || currentScreen === 'split') {
    return null;
  }

  return (
    <nav
      className="shrink-0 flex items-center justify-around"
      style={{
        height: 'var(--fnb-touch-primary, 56px)',
        backgroundColor: 'var(--fnb-bg-surface)',
        borderTop: 'var(--fnb-border-subtle)',
      }}
    >
      {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
        const isActive = activeNavTab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setNavTab(key)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors"
            style={{
              color: isActive ? 'var(--fnb-action-send)' : 'var(--fnb-text-muted)',
            }}
          >
            <Icon className="h-5 w-5" />
            <span
              className="text-[10px] font-semibold"
              style={{
                color: isActive ? 'var(--fnb-action-send)' : 'var(--fnb-text-muted)',
              }}
            >
              {label}
            </span>
            {isActive && (
              <div
                className="absolute bottom-0 h-0.5 w-10 rounded-full"
                style={{ backgroundColor: 'var(--fnb-action-send)' }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
