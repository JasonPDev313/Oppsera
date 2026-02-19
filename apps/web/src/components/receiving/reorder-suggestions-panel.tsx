'use client';

import { AlertTriangle, Plus } from 'lucide-react';
import type { ReorderSuggestion } from '@/types/receiving';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

interface ReorderSuggestionsPanelProps {
  suggestions: ReorderSuggestion[];
  isLoading: boolean;
  onQuickReceive?: (suggestion: ReorderSuggestion) => void;
}

export function ReorderSuggestionsPanel({ suggestions, isLoading, onQuickReceive }: ReorderSuggestionsPanelProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-amber-200" />
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          {suggestions.length} item{suggestions.length !== 1 ? 's' : ''} below reorder point
        </h3>
      </div>
      <div className="space-y-2">
        {suggestions.slice(0, 5).map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-gray-900">{s.name}</div>
              <div className="text-xs text-gray-500">
                On hand: {s.onHand} / Reorder: {s.reorderPoint}
                {s.preferredVendorName && ` | ${s.preferredVendorName}`}
                {s.vendorCost !== null && ` @ ${formatMoney(s.vendorCost)}`}
              </div>
            </div>
            {onQuickReceive && (
              <button
                type="button"
                onClick={() => onQuickReceive(s)}
                className="ml-2 flex shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700"
              >
                <Plus className="h-3 w-3" />
                Quick Receive
              </button>
            )}
          </div>
        ))}
        {suggestions.length > 5 && (
          <p className="text-xs text-amber-600">
            +{suggestions.length - 5} more items below reorder point
          </p>
        )}
      </div>
    </div>
  );
}
