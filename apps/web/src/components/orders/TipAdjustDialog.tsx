'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DollarSign, X } from 'lucide-react';
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

interface TipAdjustDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  locationId: string;
  onComplete: () => void;
}

export function TipAdjustDialog({ open, onClose, orderId, orderNumber, locationId, onComplete }: TipAdjustDialogProps) {
  const { toast } = useToast();
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState('');
  const [tipAmount, setTipAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (!open) {
      setTenders([]);
      setSelectedTenderId('');
      setTipAmount('');
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
          setTipAmount((activeTenders[0]!.tipAmount / 100).toFixed(2));
        }
      })
      .catch(() => {
        toast.error('Failed to load tenders');
      })
      .finally(() => setIsFetching(false));
  }, [open, orderId, locationId, toast]);

  const selectedTender = tenders.find((t) => t.id === selectedTenderId);
  const tipCents = Math.round(parseFloat(tipAmount || '0') * 100);

  const handleSubmit = async () => {
    if (!selectedTender) return;
    if (tipCents < 0) {
      toast.error('Tip amount cannot be negative');
      return;
    }

    setIsLoading(true);
    try {
      await apiFetch(`/api/v1/tenders/${selectedTenderId}/tip`, {
        method: 'PATCH',
        headers: { 'X-Location-Id': locationId },
        body: JSON.stringify({
          clientRequestId: crypto.randomUUID(),
          tenderId: selectedTenderId,
          newTipAmount: tipCents,
        }),
      });
      toast.success('Tip adjusted successfully');
      onComplete();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        toast.error('Tip adjustment conflict — please try again');
      } else {
        const e = err instanceof Error ? err : new Error('Tip adjustment failed');
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
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Adjust Tip — Order #{orderNumber}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {isFetching ? (
            <p className="text-sm text-gray-500">Loading tenders...</p>
          ) : tenders.length === 0 ? (
            <p className="text-sm text-gray-500">No tenders found for this order.</p>
          ) : (
            <>
              {/* Tender selector (if multiple) */}
              {tenders.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Tender</label>
                  <select
                    value={selectedTenderId}
                    onChange={(e) => {
                      setSelectedTenderId(e.target.value);
                      const t = tenders.find((t) => t.id === e.target.value);
                      if (t) setTipAmount((t.tipAmount / 100).toFixed(2));
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {tenders.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.tenderSequence} — {t.tenderType} — {formatMoney(t.amount)} (tip: {formatMoney(t.tipAmount)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Current tip info */}
              {selectedTender && (
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tender Amount</span>
                    <span className="font-medium text-gray-900">{formatMoney(selectedTender.amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-600">Current Tip</span>
                    <span className="font-medium text-blue-600">{formatMoney(selectedTender.tipAmount)}</span>
                  </div>
                </div>
              )}

              {/* New tip amount */}
              <div>
                <label htmlFor="newTipAmount" className="block text-sm font-medium text-gray-700 mb-1">
                  New Tip Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    id="newTipAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={tipAmount}
                    onChange={(e) => setTipAmount(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-8 pr-4 text-right text-lg font-bold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    autoFocus
                  />
                </div>
              </div>

              {/* Quick tip buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[10, 15, 18, 20].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      if (selectedTender) {
                        setTipAmount(((selectedTender.amount * pct) / 10000).toFixed(2));
                      }
                    }}
                    className="rounded-lg border border-gray-200 bg-surface px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || tenders.length === 0}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save Tip'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
