'use client';

import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Trash2, Save, Users, Loader2 } from 'lucide-react';
import type { FnbTableWithStatus } from '@/types/fnb';
import { FNB_TABLE_STATUS_COLORS } from '@/types/fnb';
import type { UseMySectionReturn } from '@/hooks/use-my-section';

interface MySectionDialogProps {
  open: boolean;
  onClose: () => void;
  tables: FnbTableWithStatus[];
  section: UseMySectionReturn;
}

export function MySectionDialog({ open, onClose, tables, section }: MySectionDialogProps) {
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const sorted = useMemo(
    () => [...tables].sort((a, b) => a.tableNumber - b.tableNumber),
    [tables],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const result = await section.saveSelection();
      if (result.conflicts.length > 0) {
        const names = result.conflicts.map((c) => `Table claimed by ${c.claimedByName ?? 'another server'}`).join(', ');
        setFeedback({ type: 'error', text: `Some tables were already claimed: ${names}` });
      } else {
        setFeedback({ type: 'success', text: `${result.savedCount} table${result.savedCount !== 1 ? 's' : ''} saved` });
        setTimeout(() => {
          onClose();
          setFeedback(null);
        }, 600);
      }
    } catch {
      setFeedback({ type: 'error', text: 'Failed to save selection' });
    } finally {
      setSaving(false);
    }
  }, [section, onClose]);

  const handleClear = useCallback(async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await section.clearSelection();
      setFeedback({ type: 'success', text: 'Selection cleared' });
      setTimeout(() => {
        onClose();
        setFeedback(null);
      }, 600);
    } catch {
      setFeedback({ type: 'error', text: 'Failed to clear selection' });
    } finally {
      setSaving(false);
    }
  }, [section, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />

      {/* Dialog panel */}
      <div className="relative z-10 w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl shadow-2xl border border-border bg-surface mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Select My Tables</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap tables to add or remove from your section
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-lg h-8 w-8 transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Table grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {section.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {sorted.map((table) => {
                const isSelected = section.myTableIds.has(table.tableId);
                const claimedBy = section.claimedByOthers.get(table.tableId);
                const isClaimed = !!claimedBy;
                const statusColor = FNB_TABLE_STATUS_COLORS[table.status] ?? '#6b7280';

                return (
                  <button
                    key={table.tableId}
                    type="button"
                    disabled={isClaimed}
                    onClick={() => section.toggleTable(table.tableId)}
                    className={`
                      relative flex flex-col items-center justify-center rounded-lg border-2 p-2.5 transition-all select-none
                      ${isClaimed
                        ? 'opacity-40 cursor-not-allowed border-input bg-muted'
                        : isSelected
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
                          : 'border-border bg-surface hover:border-input hover:bg-accent'
                      }
                    `}
                  >
                    {/* Selection checkmark */}
                    {isSelected && (
                      <span className="absolute top-1 right-1 flex items-center justify-center rounded-full h-4 w-4 bg-indigo-600 text-white">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}

                    {/* Status indicator dot */}
                    <span
                      className="h-2 w-2 rounded-full mb-1"
                      style={{ backgroundColor: statusColor }}
                    />

                    {/* Table number */}
                    <span className={`text-sm font-bold leading-none ${isSelected ? 'text-indigo-500' : 'text-foreground'}`}>
                      {table.tableNumber}
                    </span>

                    {/* Capacity */}
                    <span className="flex items-center gap-0.5 mt-1 text-[10px] text-muted-foreground">
                      <Users className="h-2.5 w-2.5" />
                      {table.capacityMax}
                    </span>

                    {/* Claimed by label */}
                    {isClaimed && (
                      <span className="text-[9px] font-medium text-muted-foreground mt-0.5 truncate max-w-full px-0.5">
                        {claimedBy}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Feedback banner */}
        {feedback && (
          <div className={`px-5 py-2 text-xs font-medium ${
            feedback.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
          }`}>
            {feedback.text}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-xs font-medium text-muted-foreground">
            {section.selectedCount} table{section.selectedCount !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            {section.hasSelection && (
              <button
                type="button"
                onClick={handleClear}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors text-red-500 hover:bg-red-500/10 border border-red-500/30"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || section.isLoading}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
