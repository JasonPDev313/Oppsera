'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

interface Tender {
  id: string;
  tenderType: string;
  amount: number;
  tipAmount: number;
  tenderSequence: number;
}

interface TenderSummaryResponse {
  tenders: Tender[];
  summary: { totalTendered: number; remainingBalance: number };
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface RefundDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  locationId: string;
  onComplete: () => void;
}

export function RefundDialog({ open, onClose, orderId, orderNumber, locationId, onComplete }: RefundDialogProps) {
  const { toast } = useToast();
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (!open) {
      setTenders([]);
      setSelectedTenderId('');
      setAmount('');
      setReason('');
      return;
    }
    setIsFetching(true);
    apiFetch<{ data: TenderSummaryResponse }>(
      `/api/v1/orders/${orderId}/tenders?orderTotal=0`,
      { headers: { 'X-Location-Id': locationId } },
    )
      .then((res) => {
        const activeTenders = res.data.tenders.filter((t: Tender) => t.amount > 0);
        setTenders(activeTenders);
        if (activeTenders.length > 0) {
          setSelectedTenderId(activeTenders[0]!.id);
          setAmount((activeTenders[0]!.amount / 100).toFixed(2));
        }
      })
      .catch(() => {
        toast.error('Failed to load tenders');
      })
      .finally(() => setIsFetching(false));
  }, [open, orderId, locationId, toast]);

  const selectedTender = tenders.find((t) => t.id === selectedTenderId);
  const amountCents = Math.round(parseFloat(amount || '0') * 100);

  const handleSubmit = async () => {
    if (!selectedTender || amountCents <= 0) return;
    if (amountCents > selectedTender.amount) {
      toast.error(`Refund amount cannot exceed ${formatMoney(selectedTender.amount)}`);
      return;
    }
    if (!reason.trim()) {
      toast.error('Reason is required');
      return;
    }

    setIsLoading(true);
    try {
      await apiFetch(`/api/v1/tenders/${selectedTenderId}/reverse`, {
        method: 'POST',
        headers: { 'X-Location-Id': locationId },
        body: JSON.stringify({
          clientRequestId: crypto.randomUUID(),
          tenderId: selectedTenderId,
          amount: amountCents,
          reason: reason.trim(),
          reversalType: 'refund',
          refundMethod: selectedTender.tenderType === 'cash' ? 'cash' : 'original_tender',
        }),
      });
      toast.success('Refund processed successfully');
      onComplete();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        toast.error('This tender has already been refunded');
      } else {
        const e = err instanceof Error ? err : new Error('Refund failed');
        toast.error(e.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-foreground">Refund Order #{orderNumber}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {isFetching ? (
            <p className="text-sm text-muted-foreground">Loading tenders...</p>
          ) : tenders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tenders found for this order.</p>
          ) : (
            <>
              {/* Tender selector (if multiple) */}
              {tenders.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Select Tender</label>
                  <select
                    value={selectedTenderId}
                    onChange={(e) => {
                      setSelectedTenderId(e.target.value);
                      const t = tenders.find((t) => t.id === e.target.value);
                      if (t) setAmount((t.amount / 100).toFixed(2));
                    }}
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {tenders.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.tenderSequence} — {t.tenderType} — {formatMoney(t.amount)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Amount */}
              <div>
                <label htmlFor="refundAmount" className="block text-sm font-medium text-foreground mb-1">
                  Refund Amount {selectedTender && <span className="text-muted-foreground">(max {formatMoney(selectedTender.amount)})</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    id="refundAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    max={selectedTender ? (selectedTender.amount / 100).toFixed(2) : undefined}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-input py-2.5 pl-8 pr-4 text-right text-lg font-bold text-foreground focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    autoFocus
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label htmlFor="refundReason" className="block text-sm font-medium text-foreground mb-1">Reason</label>
                <input
                  id="refundReason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="e.g. Customer request, wrong item..."
                />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 border-t border-border px-6 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-input px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || amountCents <= 0 || !reason.trim() || tenders.length === 0}
            className="flex-1 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : 'Process Refund'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
