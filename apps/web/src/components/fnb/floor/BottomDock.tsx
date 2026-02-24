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
      className="flex items-center justify-between px-2 sm:px-4 border-t border-gray-200 bg-surface"
      style={{ height: 'var(--fnb-touch-primary)' }}
    >
      {/* Left: stats */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-900">
            {totalCovers}
          </span>
          <span className="text-xs hidden sm:inline text-gray-400">covers</span>
        </div>
        <div className="h-4 w-px hidden sm:block bg-gray-200" />
        <span className="text-xs hidden sm:inline text-green-600">
          {availableCount} open
        </span>
        <span className="text-xs hidden sm:inline text-indigo-600">
          {seatedCount} seated
        </span>
        {openRevenueCents != null && openRevenueCents > 0 && (
          <>
            <div className="h-4 w-px hidden sm:block bg-gray-200" />
            <div className="hidden sm:flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-green-500" />
              <span className="text-xs font-semibold text-green-600">
                ${(openRevenueCents / 100).toFixed(0)}
              </span>
              <span className="text-xs text-gray-400">open</span>
            </div>
          </>
        )}
        {avgTurnMinutes != null && avgTurnMinutes > 0 && (
          <>
            <div className="h-4 w-px hidden sm:block bg-gray-200" />
            <div className="hidden sm:flex items-center gap-1">
              <Clock className="h-3 w-3 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500">
                ~{avgTurnMinutes}m
              </span>
              <span className="text-xs text-gray-400">avg turn</span>
            </div>
          </>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center justify-center rounded-lg fnb-touch-min transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
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
