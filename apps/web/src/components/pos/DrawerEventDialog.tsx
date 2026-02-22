'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowDownCircle, ArrowUpCircle, DollarSign, Ban } from 'lucide-react';
import { CurrencyInput } from '@/components/ui/currency-input';
import type { DrawerEventType } from '@/types/pos';

const EVENT_TYPES: Array<{
  type: DrawerEventType;
  label: string;
  icon: typeof ArrowDownCircle;
  color: string;
  requiresAmount: boolean;
}> = [
  { type: 'paid_in', label: 'Paid In', icon: ArrowDownCircle, color: 'text-green-600', requiresAmount: true },
  { type: 'paid_out', label: 'Paid Out', icon: ArrowUpCircle, color: 'text-red-600', requiresAmount: true },
  { type: 'cash_drop', label: 'Cash Drop', icon: DollarSign, color: 'text-blue-600', requiresAmount: true },
  { type: 'no_sale', label: 'No Sale', icon: Ban, color: 'text-gray-600', requiresAmount: false },
];

interface DrawerEventDialogProps {
  open: boolean;
  onClose: () => void;
  onRecord: (
    eventType: DrawerEventType,
    amountCents: number,
    reason?: string,
    bagId?: string,
    sealNumber?: string,
  ) => Promise<void>;
  initialType?: DrawerEventType;
}

export function DrawerEventDialog({
  open,
  onClose,
  onRecord,
  initialType,
}: DrawerEventDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedType, setSelectedType] = useState<DrawerEventType>(initialType ?? 'paid_in');
  const [amountDollars, setAmountDollars] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [bagId, setBagId] = useState('');
  const [sealNumber, setSealNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedType(initialType ?? 'paid_in');
      setAmountDollars(null);
      setReason('');
      setBagId('');
      setSealNumber('');
      setIsSubmitting(false);
    }
  }, [open, initialType]);

  if (!open) return null;

  const currentConfig = EVENT_TYPES.find((t) => t.type === selectedType)!;
  const isCashDrop = selectedType === 'cash_drop';

  const handleSubmit = async () => {
    const cents = Math.round((amountDollars ?? 0) * 100);
    if (currentConfig.requiresAmount && cents <= 0) return;

    setIsSubmitting(true);
    try {
      await onRecord(
        selectedType,
        cents,
        reason || undefined,
        isCashDrop && bagId ? bagId : undefined,
        isCashDrop && sealNumber ? sealNumber : undefined,
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = !currentConfig.requiresAmount || (amountDollars !== null && amountDollars > 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={contentRef}
        className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Drawer Event</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-gray-200/50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Event type selector */}
          <div className="grid grid-cols-2 gap-2">
            {EVENT_TYPES.map((evt) => {
              const Icon = evt.icon;
              const isSelected = selectedType === evt.type;
              return (
                <button
                  key={evt.type}
                  type="button"
                  onClick={() => setSelectedType(evt.type)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isSelected ? 'text-indigo-600' : evt.color}`} />
                  {evt.label}
                </button>
              );
            })}
          </div>

          {/* Amount input (only for paid_in, paid_out, cash_drop) */}
          {currentConfig.requiresAmount && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-500">Amount</label>
              <CurrencyInput
                value={amountDollars}
                onChange={setAmountDollars}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Cash drop: bag ID + seal number */}
          {isCashDrop && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-500">Bag ID</label>
                <input
                  type="text"
                  value={bagId}
                  onChange={(e) => setBagId(e.target.value)}
                  placeholder="BAG-001"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none bg-surface"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-500">Seal #</label>
                <input
                  type="text"
                  value={sealNumber}
                  onChange={(e) => setSealNumber(e.target.value)}
                  placeholder="SEAL-001"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none bg-surface"
                />
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-500">
              Reason {currentConfig.requiresAmount ? '' : '(optional)'}
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none bg-surface"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-100/50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !canSubmit}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Recording...' : 'Record'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
