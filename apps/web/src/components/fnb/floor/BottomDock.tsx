'use client';

import { Plus, RefreshCw, Users } from 'lucide-react';

interface BottomDockProps {
  totalCovers: number;
  availableCount: number;
  seatedCount: number;
  onNewTab: () => void;
  onRefresh: () => void;
}

export function BottomDock({ totalCovers, availableCount, seatedCount, onNewTab, onRefresh }: BottomDockProps) {
  return (
    <div
      className="flex items-center justify-between px-2 sm:px-4 border-t"
      style={{
        height: 'var(--fnb-touch-primary)',
        backgroundColor: 'var(--fnb-bg-surface)',
        borderColor: 'rgba(148, 163, 184, 0.15)',
      }}
    >
      {/* Left: stats */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4" style={{ color: 'var(--fnb-text-muted)' }} />
          <span className="text-sm font-semibold fnb-mono" style={{ color: 'var(--fnb-text-primary)' }}>
            {totalCovers}
          </span>
          <span className="text-xs hidden sm:inline" style={{ color: 'var(--fnb-text-muted)' }}>covers</span>
        </div>
        <div className="h-4 w-px hidden sm:block" style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)' }} />
        <span className="text-xs hidden sm:inline" style={{ color: 'var(--fnb-status-available)' }}>
          {availableCount} open
        </span>
        <span className="text-xs hidden sm:inline" style={{ color: 'var(--fnb-status-seated)' }}>
          {seatedCount} seated
        </span>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center justify-center rounded-lg fnb-touch-min transition-colors hover:opacity-80"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onNewTab}
          className="flex items-center gap-1.5 rounded-lg px-4 fnb-touch-min font-semibold text-sm transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--fnb-status-available)', color: '#fff' }}
        >
          <Plus className="h-4 w-4" />
          New Tab
        </button>
      </div>
    </div>
  );
}
