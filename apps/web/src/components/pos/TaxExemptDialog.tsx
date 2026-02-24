'use client';

import { useState } from 'react';
import { ShieldOff } from 'lucide-react';
import { POSSlidePanel } from './shared/POSSlidePanel';

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

  return (
    <POSSlidePanel open={open} onClose={onClose} title="Tax Exempt Reason">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-purple-600">
          <ShieldOff className="h-5 w-5" />
          <p className="text-sm font-medium">Tax Exemption</p>
        </div>

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
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors active:scale-[0.97] ${
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

        <div className="flex gap-3 pt-2">
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
    </POSSlidePanel>
  );
}
