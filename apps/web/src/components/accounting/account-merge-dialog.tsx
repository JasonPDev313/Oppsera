'use client';

import { useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Loader2, GitMerge } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { GLAccount } from '@/types/accounting';

interface AccountMergeDialogProps {
  open: boolean;
  onClose: () => void;
  sourceAccount: GLAccount | null;
  accounts: GLAccount[];
  onSuccess: () => void;
}

export function AccountMergeDialog({ open, onClose, sourceAccount, accounts, onSuccess }: AccountMergeDialogProps) {
  const { toast } = useToast();
  const [targetId, setTargetId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter to same type, active, not the source
  const eligibleTargets = useMemo(() => {
    if (!sourceAccount) return [];
    return accounts.filter(
      (a) =>
        a.id !== sourceAccount.id &&
        a.accountType === sourceAccount.accountType &&
        a.isActive,
    ).sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  }, [accounts, sourceAccount]);

  const target = useMemo(() => eligibleTargets.find((a) => a.id === targetId), [eligibleTargets, targetId]);

  const handleSubmit = useCallback(async () => {
    if (!sourceAccount || !targetId) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/accounting/accounts/${sourceAccount.id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetAccountId: targetId }),
      });
      toast.success(`Merged ${sourceAccount.accountNumber} into ${target?.accountNumber}`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [sourceAccount, targetId, target, toast, onSuccess, onClose]);

  if (!open || !sourceAccount) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Merge Account</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          {/* Source */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase">Source (will be merged)</label>
            <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-medium text-gray-900">
                {sourceAccount.accountNumber} — {sourceAccount.name}
              </p>
              <p className="text-xs capitalize text-gray-500">{sourceAccount.accountType}</p>
            </div>
          </div>

          {/* Target */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase">Target (merge into)</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select target account...</option>
              {eligibleTargets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountNumber} — {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Warning */}
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-xs text-amber-800">
              <p className="font-medium">This action cannot be undone.</p>
              <p className="mt-1">
                All journal lines from <strong>{sourceAccount.accountNumber}</strong> will be reassigned
                to the target account. The source account will be marked as merged and deactivated.
              </p>
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
            onClick={handleSubmit}
            disabled={!targetId || isSubmitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Merging...</span>
            ) : (
              'Merge Account'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
