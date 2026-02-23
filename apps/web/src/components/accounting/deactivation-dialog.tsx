'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { GLAccount } from '@/types/accounting';

interface DeactivationDialogProps {
  open: boolean;
  onClose: () => void;
  account: GLAccount | null;
  onSuccess: () => void;
}

export function DeactivationDialog({ open, onClose, account, onSuccess }: DeactivationDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDeactivate = useCallback(async () => {
    if (!account) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/accounting/accounts/${account.id}/deactivate`, {
        method: 'POST',
      });
      toast.success(`Account ${account.accountNumber} deactivated`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deactivation failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [account, toast, onSuccess, onClose]);

  if (!open || !account) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Deactivate Account</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-900">
              {account.accountNumber} — {account.name}
            </p>
            <p className="text-xs capitalize text-gray-500">{account.accountType}</p>
          </div>

          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-xs text-amber-800">
              <p className="font-medium">Deactivating this account will:</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li>Hide it from new journal entry account pickers</li>
                <li>Preserve all existing journal lines and reports</li>
                <li>Block it from receiving new GL postings</li>
              </ul>
              <p className="mt-2">You can reactivate the account later if needed.</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={isSubmitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Deactivating...</span>
            ) : (
              'Deactivate'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
