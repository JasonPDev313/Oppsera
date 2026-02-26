'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import type { ShiftSummary } from '@/types/pos';

// Denomination breakdown for cash counting
const DENOMINATIONS = [
  { label: '$100', value: 10000 },
  { label: '$50', value: 5000 },
  { label: '$20', value: 2000 },
  { label: '$10', value: 1000 },
  { label: '$5', value: 500 },
  { label: '$1', value: 100 },
  { label: '25¢', value: 25 },
  { label: '10¢', value: 10 },
  { label: '5¢', value: 5 },
  { label: '1¢', value: 1 },
] as const;

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface CloseShiftDialogProps {
  open: boolean;
  onClose: () => void;
  onCloseShift: (closingCountCents: number, notes?: string) => Promise<ShiftSummary | null>;
  openingBalanceCents: number;
}

export function CloseShiftDialog({
  open,
  onClose,
  onCloseShift,
  openingBalanceCents,
}: CloseShiftDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [showDenominations, setShowDenominations] = useState(false);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setCounts({});
      setNotes('');
      setSummary(null);
      setIsClosing(false);
      setShowDenominations(false);
    }
  }, [open]);

  const totalCents = DENOMINATIONS.reduce((sum, d) => {
    return sum + (counts[d.value] ?? 0) * d.value;
  }, 0);

  const updateCount = useCallback((denomValue: number, delta: number) => {
    setCounts((prev) => {
      const current = prev[denomValue] ?? 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [denomValue]: next };
    });
  }, []);

  const handleClose = async () => {
    setIsClosing(true);
    const result = await onCloseShift(totalCents, notes || undefined);
    if (result) {
      setSummary(result);
    } else {
      setIsClosing(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="close-shift-dialog-title">
      <div className="absolute inset-0 bg-black/50" onClick={summary ? onClose : undefined} />
      <div
        ref={contentRef}
        className="relative z-10 w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="close-shift-dialog-title" className="text-lg font-semibold">{summary ? 'Shift Summary' : 'Close Shift'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-accent/50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {summary ? (
          // ── Summary View ──────────────────────────────────────────
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">Sales Count</div>
              <div className="text-right font-medium">{summary.salesCount}</div>
              <div className="text-muted-foreground">Sales Total</div>
              <div className="text-right font-medium">{formatMoney(summary.salesTotal)}</div>
              <div className="text-muted-foreground">Cash Received</div>
              <div className="text-right font-medium">{formatMoney(summary.cashReceived)}</div>
              <div className="text-muted-foreground">Card Received</div>
              <div className="text-right font-medium">{formatMoney(summary.cardReceived)}</div>
              <div className="text-muted-foreground">Tips Collected</div>
              <div className="text-right font-medium">{formatMoney(summary.tipsCollected)}</div>
              <div className="text-muted-foreground">Paid In</div>
              <div className="text-right font-medium">{formatMoney(summary.paidInTotal)}</div>
              <div className="text-muted-foreground">Paid Out</div>
              <div className="text-right font-medium">{formatMoney(summary.paidOutTotal)}</div>
              <div className="text-muted-foreground">Cash Drops</div>
              <div className="text-right font-medium">{formatMoney(summary.cashDropTotal)}</div>
              <div className="border-t border-border col-span-2" />
              <div className="text-muted-foreground">Opening Balance</div>
              <div className="text-right font-medium">{formatMoney(summary.openingBalanceCents)}</div>
              <div className="text-muted-foreground">Expected Cash</div>
              <div className="text-right font-medium">{formatMoney(summary.expectedCashCents)}</div>
              <div className="text-muted-foreground">Counted Cash</div>
              <div className="text-right font-medium">{formatMoney(summary.closingCountCents ?? 0)}</div>
              <div className="text-muted-foreground font-semibold">Variance</div>
              <div className={`text-right font-bold ${(summary.varianceCents ?? 0) === 0 ? 'text-green-500' : (summary.varianceCents ?? 0) > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                {(summary.varianceCents ?? 0) === 0 ? 'Balanced' : formatMoney(summary.varianceCents ?? 0)}
              </div>
            </div>

            {summary.salesByDepartment.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Sales by Department</h3>
                {summary.salesByDepartment.map((dept) => (
                  <div key={dept.departmentName} className="flex justify-between text-sm py-0.5">
                    <span>{dept.departmentName}</span>
                    <span className="font-medium">{formatMoney(dept.total)} ({dept.count})</span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Done
            </button>
          </div>
        ) : (
          // ── Cash Count View ───────────────────────────────────────
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-center">
              <div className="text-sm text-muted-foreground">Opening Balance</div>
              <div className="text-lg font-semibold">{formatMoney(openingBalanceCents)}</div>
            </div>

            <button
              type="button"
              onClick={() => setShowDenominations(!showDenominations)}
              className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <span>Count by Denomination</span>
              {showDenominations ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {showDenominations && (
              <div className="space-y-2">
                {DENOMINATIONS.map((d) => (
                  <div key={d.value} className="flex items-center justify-between">
                    <span className="w-16 text-sm font-medium">{d.label}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateCount(d.value, -1)}
                        className="h-8 w-8 rounded-lg border border-input text-sm font-bold transition-colors hover:bg-accent"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm font-medium">
                        {counts[d.value] ?? 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCount(d.value, 1)}
                        className="h-8 w-8 rounded-lg border border-input text-sm font-bold transition-colors hover:bg-accent"
                      >
                        +
                      </button>
                      <span className="w-20 text-right text-sm text-muted-foreground">
                        {formatMoney((counts[d.value] ?? 0) * d.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg bg-indigo-500/10 p-3 text-center">
              <div className="text-sm text-indigo-400">Counted Cash</div>
              <div className="text-2xl font-bold text-indigo-400">{formatMoney(totalCents)}</div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this shift..."
                rows={2}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none bg-surface"
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
                onClick={handleClose}
                disabled={isClosing}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {isClosing ? 'Closing...' : 'Close Shift'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
