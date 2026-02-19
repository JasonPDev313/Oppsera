'use client';

import { useState } from 'react';

interface VoidReceiptDialogProps {
  open: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isVoiding?: boolean;
}

export function VoidReceiptDialog({ open, onConfirm, onClose, isVoiding }: VoidReceiptDialogProps) {
  const [reason, setReason] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Void Receipt</h3>
        <p className="mt-2 text-sm text-gray-500">
          This will reverse all inventory movements from this receipt. Please provide a reason.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for voiding..."
          rows={3}
          className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => { setReason(''); onClose(); }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!reason.trim() || isVoiding}
            onClick={() => { onConfirm(reason.trim()); setReason(''); }}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isVoiding ? 'Voiding...' : 'Void Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}
