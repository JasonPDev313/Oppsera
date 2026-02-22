'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { AccountPicker } from '@/components/accounting/account-picker';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { GLAccount, AccountType, NormalBalance } from '@/types/accounting';

interface AccountDialogProps {
  open: boolean;
  onClose: () => void;
  account: GLAccount | null;
  onSuccess: () => void;
}

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
];

const CONTROL_TYPES = [
  { value: 'ap', label: 'Accounts Payable' },
  { value: 'ar', label: 'Accounts Receivable' },
  { value: 'sales_tax', label: 'Sales Tax Payable' },
  { value: 'undeposited_funds', label: 'Undeposited Funds' },
  { value: 'bank', label: 'Bank' },
];

const NORMAL_BALANCE_MAP: Record<AccountType, NormalBalance> = {
  asset: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
  expense: 'debit',
};

export function AccountDialog({ open, onClose, account, onSuccess }: AccountDialogProps) {
  const { toast } = useToast();
  const isEdit = !!account;

  const [form, setForm] = useState({
    accountNumber: '',
    name: '',
    accountType: 'expense' as AccountType,
    classificationId: null as string | null,
    parentAccountId: null as string | null,
    description: '',
    isControlAccount: false,
    controlAccountType: '' as string,
    isContraAccount: false,
    allowManualPosting: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultForm = {
    accountNumber: '',
    name: '',
    accountType: 'expense' as AccountType,
    classificationId: null as string | null,
    parentAccountId: null as string | null,
    description: '',
    isControlAccount: false,
    controlAccountType: '',
    isContraAccount: false,
    allowManualPosting: true,
  };

  useEffect(() => {
    if (!open) {
      // Reset form when dialog closes to prevent stale data on reopen
      setForm(defaultForm);
      setErrors({});
      return;
    }
    if (account) {
      setForm({
        accountNumber: account.accountNumber,
        name: account.name,
        accountType: account.accountType,
        classificationId: account.classificationId,
        parentAccountId: account.parentAccountId,
        description: account.description ?? '',
        isControlAccount: account.isControlAccount,
        controlAccountType: account.controlAccountType ?? '',
        isContraAccount: account.isContraAccount,
        allowManualPosting: account.allowManualPosting,
      });
    } else {
      setForm(defaultForm);
    }
    setErrors({});
  }, [account, open]);

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!form.accountNumber.trim()) errs.accountNumber = 'Account number is required';
    if (!form.name.trim()) errs.name = 'Account name is required';
    if (form.isControlAccount && !form.controlAccountType) {
      errs.controlAccountType = 'Select a control account type';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const body = {
        accountNumber: form.accountNumber.trim(),
        name: form.name.trim(),
        accountType: form.accountType,
        normalBalance: NORMAL_BALANCE_MAP[form.accountType],
        classificationId: form.classificationId || undefined,
        parentAccountId: form.parentAccountId || undefined,
        description: form.description.trim() || undefined,
        isControlAccount: form.isControlAccount,
        controlAccountType: form.isControlAccount ? form.controlAccountType : undefined,
        isContraAccount: form.isContraAccount,
        allowManualPosting: form.allowManualPosting,
      };

      if (isEdit) {
        await apiFetch(`/api/v1/accounting/accounts/${account!.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toast.success('Account updated');
      } else {
        await apiFetch('/api/v1/accounting/accounts', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toast.success('Account created');
      }
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save account');
    } finally {
      setIsSubmitting(false);
    }
  }, [form, isEdit, account, validate, onSuccess, toast]);

  if (!open || typeof document === 'undefined') return null;

  const normalBalance = NORMAL_BALANCE_MAP[form.accountType];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Account' : 'New Account'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Account Number" required error={errors.accountNumber}>
              <input
                type="text"
                value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="e.g. 1010"
              />
            </FormField>
            <FormField label="Account Type" required>
              <Select
                options={ACCOUNT_TYPES}
                value={form.accountType}
                onChange={(v) => setForm((f) => ({ ...f, accountType: v as AccountType }))}
              />
            </FormField>
          </div>

          <FormField label="Account Name" required error={errors.name}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="e.g. Cash on Hand"
            />
          </FormField>

          <FormField label="Normal Balance">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 capitalize">
              {normalBalance}
            </div>
          </FormField>

          <FormField label="Parent Account" helpText="Nest under another account of the same type">
            <AccountPicker
              value={form.parentAccountId}
              onChange={(v) => setForm((f) => ({ ...f, parentAccountId: v }))}
              accountTypes={[form.accountType]}
              placeholder="None (top-level)"
            />
          </FormField>

          <FormField label="Description">
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="Optional description..."
            />
          </FormField>

          {/* Control Account */}
          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isControlAccount}
                onChange={(e) => setForm((f) => ({ ...f, isControlAccount: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">Control Account</span>
            </label>
            {form.isControlAccount && (
              <FormField label="Control Account Type" required error={errors.controlAccountType}>
                <Select
                  options={CONTROL_TYPES}
                  value={form.controlAccountType}
                  onChange={(v) => setForm((f) => ({ ...f, controlAccountType: v as string }))}
                  placeholder="Select type..."
                />
              </FormField>
            )}
          </div>

          {/* Contra Account — only for revenue/expense types */}
          {(form.accountType === 'revenue' || form.accountType === 'expense') && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isContraAccount}
                onChange={(e) => setForm((f) => ({ ...f, isContraAccount: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">Contra Account</span>
              <span className="text-xs text-gray-400">(displays as deduction in financial statements)</span>
            </label>
          )}

          {/* Allow Manual Posting */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.allowManualPosting}
              onChange={(e) => setForm((f) => ({ ...f, allowManualPosting: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">Allow Manual Posting</span>
          </label>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
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
            disabled={isSubmitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : isEdit ? 'Update Account' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
