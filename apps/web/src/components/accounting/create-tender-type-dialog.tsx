'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AccountPicker } from '@/components/accounting/account-picker';
import { useToast } from '@/components/ui/toast';
import { useCreateTenderType } from '@/hooks/use-mappings';

const CATEGORY_OPTIONS = [
  { value: 'external_card', label: 'External Card' },
  { value: 'external_cash', label: 'External Cash' },
  { value: 'external_ach', label: 'External ACH/EFT' },
  { value: 'external_wallet', label: 'External Wallet' },
  { value: 'house_account', label: 'House Account' },
  { value: 'barter', label: 'Barter/Trade' },
  { value: 'comp', label: 'Comp/Giveaway' },
  { value: 'other', label: 'Other' },
];

const POSTING_MODE_OPTIONS = [
  { value: 'clearing', label: 'Clearing', description: 'Funds go to a clearing account, then settled to bank' },
  { value: 'direct_bank', label: 'Direct to Bank', description: 'Funds deposited directly to a bank account' },
  { value: 'non_cash', label: 'Non-Cash', description: 'Comp, barter, or other non-cash tender' },
];

interface CreateTenderTypeDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateTenderTypeDialog({ open, onClose }: CreateTenderTypeDialogProps) {
  const { toast } = useToast();
  const createTenderType = useCreateTenderType();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState('other');
  const [postingMode, setPostingMode] = useState('clearing');
  const [requiresReference, setRequiresReference] = useState(false);
  const [referenceLabel, setReferenceLabel] = useState('');
  const [defaultClearingAccountId, setDefaultClearingAccountId] = useState<string | null>(null);
  const [defaultBankAccountId, setDefaultBankAccountId] = useState<string | null>(null);
  const [defaultFeeAccountId, setDefaultFeeAccountId] = useState<string | null>(null);
  const [defaultExpenseAccountId, setDefaultExpenseAccountId] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setCode('');
    setCategory('other');
    setPostingMode('clearing');
    setRequiresReference(false);
    setReferenceLabel('');
    setDefaultClearingAccountId(null);
    setDefaultBankAccountId(null);
    setDefaultFeeAccountId(null);
    setDefaultExpenseAccountId(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-generate code from name if code hasn't been manually edited
    if (!code || code === nameToCode(name)) {
      setCode(nameToCode(value));
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !code.trim()) {
      toast.error('Name and code are required');
      return;
    }

    if (!/^[a-z][a-z0-9_]*$/.test(code)) {
      toast.error('Code must start with a letter and contain only lowercase letters, numbers, and underscores');
      return;
    }

    try {
      await createTenderType.mutateAsync({
        name: name.trim(),
        code: code.trim(),
        category,
        postingMode,
        requiresReference,
        referenceLabel: requiresReference ? referenceLabel.trim() || undefined : undefined,
        defaultClearingAccountId: postingMode === 'clearing' ? defaultClearingAccountId : null,
        defaultBankAccountId: postingMode === 'direct_bank' ? defaultBankAccountId : null,
        defaultFeeAccountId,
        defaultExpenseAccountId: postingMode === 'non_cash' ? defaultExpenseAccountId : null,
      });
      toast.success(`Custom payment type "${name}" created`);
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create tender type');
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative mx-4 w-full max-w-lg rounded-xl border border-gray-200 bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Add Custom Payment Type</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/50 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Name + Code */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Stripe Terminal"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-surface"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="e.g. stripe_terminal"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-surface"
              />
              <p className="mt-0.5 text-xs text-gray-400">Lowercase letters, numbers, underscores</p>
            </div>
          </div>

          {/* Category + Posting Mode */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-surface"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Posting Mode</label>
              <select
                value={postingMode}
                onChange={(e) => setPostingMode(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-surface"
              >
                {POSTING_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="mt-0.5 text-xs text-gray-400">
                {POSTING_MODE_OPTIONS.find((o) => o.value === postingMode)?.description}
              </p>
            </div>
          </div>

          {/* Default Accounts based on posting mode */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Default Accounts</label>

            {postingMode === 'clearing' && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-28 shrink-0">Clearing</span>
                  <AccountPicker
                    value={defaultClearingAccountId}
                    onChange={setDefaultClearingAccountId}
                    accountTypes={['asset', 'liability']}
                    suggestFor={name}
                    mappingRole="clearing"
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-28 shrink-0">Processing Fee</span>
                  <AccountPicker
                    value={defaultFeeAccountId}
                    onChange={setDefaultFeeAccountId}
                    accountTypes={['expense']}
                    suggestFor={name}
                    mappingRole="fee"
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            {postingMode === 'direct_bank' && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-28 shrink-0">Bank Account</span>
                  <AccountPicker
                    value={defaultBankAccountId}
                    onChange={setDefaultBankAccountId}
                    accountTypes={['asset']}
                    suggestFor={name}
                    mappingRole="cash"
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-28 shrink-0">Processing Fee</span>
                  <AccountPicker
                    value={defaultFeeAccountId}
                    onChange={setDefaultFeeAccountId}
                    accountTypes={['expense']}
                    suggestFor={name}
                    mappingRole="fee"
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            {postingMode === 'non_cash' && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-28 shrink-0">Expense Account</span>
                  <AccountPicker
                    value={defaultExpenseAccountId}
                    onChange={setDefaultExpenseAccountId}
                    accountTypes={['expense']}
                    suggestFor={name}
                    mappingRole="expense"
                    className="flex-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Reference toggle */}
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requiresReference}
                onChange={(e) => setRequiresReference(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Requires external reference number</span>
            </label>
            {requiresReference && (
              <input
                type="text"
                value={referenceLabel}
                onChange={(e) => setReferenceLabel(e.target.value)}
                placeholder="Label (e.g. External Receipt #)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-surface"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={createTenderType.isPending || !name.trim() || !code.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createTenderType.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function nameToCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^[^a-z]*/, '')
    .slice(0, 30);
}
