'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { TierBadge } from './tier-badge';

interface ChangeTierDialogProps {
  currentTier: string;
  recommendedTier: string;
  warnings: string[];
  dataPreservation: string[];
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isSubmitting: boolean;
}

export function ChangeTierDialog({
  currentTier,
  recommendedTier,
  warnings,
  dataPreservation,
  onConfirm,
  onClose,
  isSubmitting,
}: ChangeTierDialogProps) {
  const [reason, setReason] = useState('');

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Change Business Tier</h2>
          <button type="button" onClick={onClose} disabled={isSubmitting}>
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-500">Current</p>
            <TierBadge tier={currentTier} size="lg" />
          </div>
          <span className="text-gray-400">&rarr;</span>
          <div className="text-center">
            <p className="text-xs text-gray-500">New</p>
            <TierBadge tier={recommendedTier} size="lg" />
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">Warnings</span>
            </div>
            <ul className="mt-2 space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-700">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {dataPreservation.length > 0 && (
          <div className="mt-3 rounded-lg bg-blue-50 p-3">
            <span className="text-sm font-medium text-blue-800">Data Preservation</span>
            <ul className="mt-2 space-y-1">
              {dataPreservation.map((d, i) => (
                <li key={i} className="text-xs text-blue-700">
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Reason for change
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            placeholder="e.g., Business growth, manual override"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm Change
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
