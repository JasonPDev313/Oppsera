'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { CurrencyInput } from '@/components/ui/currency-input';

interface OpenShiftDialogProps {
  open: boolean;
  onClose: () => void;
  onOpen: (openingBalanceCents: number, changeFundCents?: number) => void;
}

export function OpenShiftDialog({ open, onClose, onOpen }: OpenShiftDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [amountDollars, setAmountDollars] = useState<number | null>(0);
  const [changeFundDollars, setChangeFundDollars] = useState<number | null>(0);

  useEffect(() => {
    if (open) {
      setAmountDollars(0);
      setChangeFundDollars(0);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    const cents = Math.round((amountDollars ?? 0) * 100);
    const changeFundCents = Math.round((changeFundDollars ?? 0) * 100);
    onOpen(cents, changeFundCents > 0 ? changeFundCents : undefined);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={contentRef}
        className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Open Shift</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-gray-200/50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-500">
              Opening Balance (cash in drawer)
            </label>
            <CurrencyInput
              value={amountDollars}
              onChange={setAmountDollars}
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-500">
              Change Fund (optional separate float)
            </label>
            <CurrencyInput
              value={changeFundDollars}
              onChange={setChangeFundDollars}
              placeholder="0.00"
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
              className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              Open Shift
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
