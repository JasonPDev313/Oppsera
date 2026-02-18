'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldOff, X } from 'lucide-react';

interface TaxExemptDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function TaxExemptDialog({ open, onClose, onConfirm }: TaxExemptDialogProps) {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason('');
    onClose();
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Tax Exempt Reason</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Please provide a reason for the tax exemption. This will be recorded on the order and receipt.
          </p>

          {/* Quick reason buttons */}
          <div className="grid grid-cols-2 gap-2">
            {['Resale Certificate', 'Non-Profit Organization', 'Government Entity', 'Diplomatic Exemption'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  reason === r
                    ? 'border-purple-300 bg-purple-50 text-purple-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="taxExemptReason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason
            </label>
            <input
              id="taxExemptReason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              placeholder="Enter tax exempt reason..."
              autoFocus
            />
          </div>
        </div>

        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!reason.trim()}
            className="flex-1 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply Tax Exempt
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
