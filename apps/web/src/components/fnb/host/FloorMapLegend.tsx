'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface LegendItem {
  status: string;
  label: string;
  color: string;
  count: number;
}

interface FloorMapLegendProps {
  items: LegendItem[];
  activeFilter: string | null;
  onFilterToggle: (status: string | null) => void;
}

export function FloorMapLegend({ items, activeFilter, onFilterToggle }: FloorMapLegendProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="absolute bottom-3 right-3 rounded-lg z-10"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        border: 'var(--fnb-border-subtle)',
        minWidth: 140,
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full px-3 py-1.5"
      >
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          Legend
        </span>
        {collapsed ? (
          <ChevronUp size={12} style={{ color: 'var(--fnb-text-muted)' }} />
        ) : (
          <ChevronDown size={12} style={{ color: 'var(--fnb-text-muted)' }} />
        )}
      </button>

      {/* Items */}
      {!collapsed && (
        <div className="px-2 pb-2 flex flex-col gap-0.5">
          {items.map((item) => {
            const isActive = activeFilter === item.status;
            return (
              <button
                key={item.status}
                type="button"
                onClick={() => onFilterToggle(isActive ? null : item.status)}
                className="flex items-center gap-2 rounded-md px-2 py-1 transition-all"
                style={{
                  backgroundColor: isActive ? 'var(--fnb-bg-elevated)' : 'transparent',
                }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span
                  className="text-[10px] font-medium flex-1 text-left"
                  style={{
                    color: isActive ? 'var(--fnb-text-primary)' : 'var(--fnb-text-secondary)',
                  }}
                >
                  {item.label}
                </span>
                <span
                  className="text-[9px] font-bold tabular-nums"
                  style={{
                    color: 'var(--fnb-text-muted)',
                    fontFamily: 'var(--fnb-font-mono)',
                  }}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
