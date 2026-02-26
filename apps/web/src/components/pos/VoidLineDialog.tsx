'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2 } from 'lucide-react';

interface VoidLineDialogProps {
  open: boolean;
  onClose: () => void;
  onVoid: (reason: string, wasteTracking: boolean) => void;
  itemName?: string;
  amountCents?: number;
}

const QUICK_REASONS = [
  'Customer changed mind',
  'Wrong item entered',
  'Duplicate entry',
  'Quality issue',
  'Kitchen error',
];

export function VoidLineDialog({ open, onClose, onVoid, itemName, amountCents }: VoidLineDialogProps) {
  const [reason, setReason] = useState('');
  const [wasteTracking, setWasteTracking] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setWasteTracking(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    if (!reason.trim()) return;
    onVoid(reason.trim(), wasteTracking);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="void-line-dialog-title">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-500" aria-hidden="true" />
            <h2 id="void-line-dialog-title" className="text-lg font-semibold">Void Line Item</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-accent/50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {itemName && (
            <div className="rounded-lg bg-red-500/10 px-3 py-2">
              <p className="text-sm font-medium text-red-500">{itemName}</p>
              {amountCents != null && (
                <p className="text-xs text-red-500">
                  Amount: ${(amountCents / 100).toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Quick reasons */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Reason</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                    reason === r
                      ? 'bg-indigo-600 text-white'
                      : 'bg-muted/80 hover:bg-accent/80'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for voiding..."
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Waste tracking */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={wasteTracking}
              onChange={(e) => setWasteTracking(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">Track as waste (item was already prepared/sent)</span>
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-input px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!reason.trim()}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
            >
              Void Item
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
