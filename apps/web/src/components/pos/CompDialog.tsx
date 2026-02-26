'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Gift } from 'lucide-react';

interface CompDialogProps {
  open: boolean;
  onClose: () => void;
  onComp: (reason: string, category: string) => void;
  itemName?: string;
  amountCents?: number;
}

const COMP_CATEGORIES = [
  { value: 'manager', label: 'Manager Comp' },
  { value: 'promo', label: 'Promotional' },
  { value: 'quality', label: 'Quality Issue' },
  { value: 'other', label: 'Other' },
];

const QUICK_REASONS = [
  'Customer satisfaction',
  'Quality issue',
  'Manager discretion',
  'Promotional offer',
  'Employee meal',
];

export function CompDialog({ open, onClose, onComp, itemName, amountCents }: CompDialogProps) {
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('manager');

  useEffect(() => {
    if (open) {
      setReason('');
      setCategory('manager');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    if (!reason.trim()) return;
    onComp(reason.trim(), category);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="comp-dialog-title">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-purple-500" aria-hidden="true" />
            <h2 id="comp-dialog-title" className="text-lg font-semibold">Comp Item</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-gray-200/50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {itemName && (
            <div className="rounded-lg bg-purple-500/10 px-3 py-2">
              <p className="text-sm font-medium text-purple-500">{itemName}</p>
              {amountCents != null && (
                <p className="text-xs text-purple-600">
                  Comp amount: ${(amountCents / 100).toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Category */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Category</label>
            <div className="flex flex-wrap gap-2">
              {COMP_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    category === cat.value
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100/80 hover:bg-gray-200/80'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

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
                      : 'bg-gray-100/80 hover:bg-gray-200/80'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for comp..."
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

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
              className="flex-1 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-40"
            >
              Comp Item
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
