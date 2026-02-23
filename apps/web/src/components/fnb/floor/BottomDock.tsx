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
