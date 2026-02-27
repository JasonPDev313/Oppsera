'use client';

import { Plus, RefreshCw, Users, DollarSign, Clock } from 'lucide-react';

interface BottomDockProps {
  totalCovers: number;
  availableCount: number;
  seatedCount: number;
  onNewTab: () => void;
  onRefresh: () => void;
  /** Total open revenue in cents */
  openRevenueCents?: number;
  /** Average turn time in minutes */
  avgTurnMinutes?: number | null;
}

export function BottomDock({ totalCovers, availableCount, seatedCount, onNewTab, onRefresh, openRevenueCents, avgTurnMinutes }: BottomDockProps) {
  return (
    <div
      className="flex items-center justify-between px-2 sm:px-4 border-t border-border bg-surface"
      style={{ height: 'var(--fnb-touch-primary)' }}
    >
      {/* Left: stats */}
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="text-[9px] text-muted-foreground opacity-50 hidden sm:inline">v1.0</span>
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            {totalCovers}
          </span>
          <span className="text-xs hidden sm:inline text-muted-foreground">covers</span>
        </div>
        <div className="h-4 w-px hidden sm:block bg-muted" />
        <span className="text-xs hidden sm:inline text-green-500">
          {availableCount} open
        </span>
        <span className="text-xs hidden sm:inline text-indigo-500">
          {seatedCount} seated
        </span>
        {openRevenueCents != null && openRevenueCents > 0 && (
          <>
            <div className="h-4 w-px hidden sm:block bg-muted" />
            <div className="hidden sm:flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-green-500" />
              <span className="text-xs font-semibold text-green-500">
                ${(openRevenueCents / 100).toFixed(0)}
              </span>
              <span className="text-xs text-muted-foreground">open</span>
            </div>
          </>
        )}
        {avgTurnMinutes != null && avgTurnMinutes > 0 && (
          <>
            <div className="h-4 w-px hidden sm:block bg-muted" />
            <div className="hidden sm:flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">
                ~{avgTurnMinutes}m
              </span>
              <span className="text-xs text-muted-foreground">avg turn</span>
            </div>
          </>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center justify-center rounded-lg fnb-touch-min transition-colors bg-muted text-muted-foreground hover:bg-accent"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onNewTab}
          className="flex items-center gap-1.5 rounded-lg px-4 fnb-touch-min font-semibold text-sm transition-colors bg-green-600 text-white hover:bg-green-700"
        >
          <Plus className="h-4 w-4" />
          New Tab
        </button>
      </div>
    </div>
  );
}
