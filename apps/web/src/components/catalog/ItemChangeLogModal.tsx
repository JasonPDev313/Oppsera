'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  History,
  ArrowRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  useItemChangeLog,
  type ChangeLogEntry,
  type FieldChange,
  type ChangeLogFilters,
} from '@/hooks/use-item-change-log';

// ── Field display mapping ───────────────────────────────────────

const FIELD_DISPLAY: Record<
  string,
  { label: string; format?: 'currency' | 'date' | 'boolean' | 'lookup' | 'text' }
> = {
  name: { label: 'Item Name', format: 'text' },
  defaultPrice: { label: 'Price', format: 'currency' },
  cost: { label: 'Unit Cost', format: 'currency' },
  sku: { label: 'SKU', format: 'text' },
  barcode: { label: 'Barcode', format: 'text' },
  categoryId: { label: 'Category', format: 'lookup' },
  taxCategoryId: { label: 'Tax Category', format: 'lookup' },
  isTrackable: { label: 'Track Inventory', format: 'boolean' },
  itemType: { label: 'Item Type', format: 'text' },
  description: { label: 'Description', format: 'text' },
  archivedAt: { label: 'Archived', format: 'date' },
  archivedBy: { label: 'Archived By', format: 'text' },
  archivedReason: { label: 'Archive Reason', format: 'text' },
  metadata: { label: 'Configuration', format: 'text' },
};

const ACTION_BADGES: Record<string, { label: string; variant: string }> = {
  CREATED: { label: 'Created', variant: 'success' },
  UPDATED: { label: 'Updated', variant: 'info' },
  ARCHIVED: { label: 'Archived', variant: 'warning' },
  RESTORED: { label: 'Restored', variant: 'success' },
  COST_UPDATED: { label: 'Cost Updated', variant: 'purple' },
  INVENTORY_ADJUSTED: { label: 'Inventory Adjusted', variant: 'orange' },
  IMPORTED: { label: 'Imported', variant: 'neutral' },
};

const ACTION_TYPE_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'CREATED', label: 'Created' },
  { value: 'UPDATED', label: 'Updated' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'RESTORED', label: 'Restored' },
  { value: 'COST_UPDATED', label: 'Cost Updated' },
  { value: 'INVENTORY_ADJUSTED', label: 'Inventory Adjusted' },
  { value: 'IMPORTED', label: 'Imported' },
];

// ── Format helpers ──────────────────────────────────────────────

function formatValue(
  value: unknown,
  format?: string,
  displayName?: string | null,
): string {
  if (value === null || value === undefined) return '--';

  if (displayName) return displayName;

  switch (format) {
    case 'currency':
      return `$${Number(value).toFixed(2)}`;
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'date': {
      const d = new Date(value as string);
      return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
    }
    case 'text':
    default:
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Sub-components ──────────────────────────────────────────────

function FieldChangeRow({
  fieldKey,
  change,
}: {
  fieldKey: string;
  change: FieldChange;
}) {
  const display = FIELD_DISPLAY[fieldKey] ?? { label: fieldKey, format: 'text' };
  const fc = change as FieldChange & { oldDisplay?: string | null; newDisplay?: string | null };

  const oldStr = formatValue(change.old, display.format, fc.oldDisplay);
  const newStr = formatValue(change.new, display.format, fc.newDisplay);

  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      <span className="w-32 shrink-0 text-gray-500 font-medium">{display.label}</span>
      <span className="text-gray-400 line-through">{oldStr}</span>
      <ArrowRight className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
      <span className="text-gray-900 font-medium">{newStr}</span>
    </div>
  );
}

function ChangeLogEntryCard({ entry }: { entry: ChangeLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const badge = ACTION_BADGES[entry.actionType] ?? {
    label: entry.actionType,
    variant: 'neutral',
  };
  const fieldKeys = Object.keys(entry.fieldChanges);
  const hasChanges = fieldKeys.length > 0;

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        type="button"
        onClick={() => hasChanges && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${
          hasChanges ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
        }`}
      >
        {hasChanges ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          )
        ) : (
          <div className="w-4 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            <span className="text-sm text-gray-900">
              {entry.summary ?? badge.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
            <span>{formatDate(entry.changedAt)}</span>
            {entry.changedByName && (
              <>
                <span>&middot;</span>
                <span>{entry.changedByName}</span>
              </>
            )}
            {entry.source !== 'UI' && (
              <>
                <span>&middot;</span>
                <span className="uppercase">{entry.source}</span>
              </>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 pl-11 space-y-0">
          {fieldKeys.map((key) => (
            <FieldChangeRow
              key={key}
              fieldKey={key}
              change={entry.fieldChanges[key]!}
            />
          ))}
          {entry.notes && (
            <div className="mt-2 pt-2 border-t border-gray-100 text-sm text-gray-600">
              <span className="font-medium text-gray-500">Note:</span>{' '}
              {entry.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Modal ──────────────────────────────────────────────────

interface ItemChangeLogModalProps {
  open: boolean;
  onClose: () => void;
  itemId: string;
  itemName: string;
}

export function ItemChangeLogModal({
  open,
  onClose,
  itemId,
  itemName,
}: ItemChangeLogModalProps) {
  const [filters, setFilters] = useState<ChangeLogFilters>({});
  const { entries, isLoading, isLoadingMore, hasMore, loadMore } =
    useItemChangeLog(open ? itemId : null, filters);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  // Reset filters when modal opens for a new item
  useEffect(() => {
    if (open) setFilters({});
  }, [open, itemId]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] flex flex-col rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Change History
            </h2>
            <span className="text-sm text-gray-500 truncate max-w-[200px]">
              &mdash; {itemName}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50/50">
          <select
            value={filters.actionType ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                actionType: e.target.value || undefined,
              }))
            }
            className="rounded-md border border-gray-300 bg-surface px-2.5 py-1.5 text-sm text-gray-700"
          >
            {ACTION_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) =>
              setFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))
            }
            placeholder="From"
            className="rounded-md border border-gray-300 bg-surface px-2.5 py-1.5 text-sm text-gray-700"
          />
          <input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) =>
              setFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))
            }
            placeholder="To"
            className="rounded-md border border-gray-300 bg-surface px-2.5 py-1.5 text-sm text-gray-700"
          />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <History className="h-10 w-10 mb-2" />
              <p className="text-sm">No change history found</p>
            </div>
          ) : (
            <>
              {entries.map((entry) => (
                <ChangeLogEntryCard key={entry.id} entry={entry} />
              ))}
              {hasMore && (
                <div className="flex justify-center pt-2 pb-1">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="text-sm text-indigo-600 hover:text-indigo-500 font-medium disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      'Load More'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
