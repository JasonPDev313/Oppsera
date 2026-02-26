'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Building2, Star, Pencil } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountPicker } from '@/components/accounting/account-picker';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import { useBankAccounts, useBankAccountMutations } from '@/hooks/use-mappings';
import { useToast } from '@/components/ui/toast';
import type { BankAccount } from '@/types/accounting';

export default function BanksContent() {
  const { data: banks, isLoading, mutate } = useBankAccounts();
  const [showDialog, setShowDialog] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);

  const handleCreate = () => {
    setEditingBank(null);
    setShowDialog(true);
  };

  const handleEdit = (bank: BankAccount) => {
    setEditingBank(bank);
    setShowDialog(true);
  };

  return (
    <AccountingPageShell
      title="Bank Accounts"
      breadcrumbs={[{ label: 'Bank Accounts' }]}
      actions={
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          Add Bank Account
        </button>
      }
    >
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && banks.length === 0 && (
        <AccountingEmptyState
          title="No bank accounts"
          description="Add bank accounts to link them to your chart of accounts for payment processing and reconciliation."
          actionLabel="Add Bank Account"
          onAction={handleCreate}
        />
      )}

      {!isLoading && banks.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banks.map((bank) => (
            <div
              key={bank.id}
              className={`relative rounded-lg border bg-surface p-5 space-y-3 ${
                bank.isActive ? 'border-border' : 'border-border opacity-60'
              }`}
            >
              {bank.isDefault && (
                <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20">
                  <Star className="h-3.5 w-3.5 text-amber-500" fill="currentColor" />
                </div>
              )}

              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10">
                    <Building2 className="h-5 w-5 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{bank.name}</h3>
                    {bank.bankName && (
                      <p className="text-xs text-muted-foreground">{bank.bankName}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleEdit(bank)}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>

              {bank.accountNumberLast4 && (
                <p className="text-sm text-muted-foreground">
                  Account ending in <span className="font-mono font-medium text-foreground">••••{bank.accountNumberLast4}</span>
                </p>
              )}

              <div className="rounded-lg bg-muted p-2">
                <p className="text-xs text-muted-foreground">Linked GL Account</p>
                <p className="text-sm text-foreground">
                  {bank.glAccountNumber && (
                    <span className="mr-1.5 font-mono text-xs text-muted-foreground">{bank.glAccountNumber}</span>
                  )}
                  {bank.glAccountName ?? 'Not linked'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {bank.isDefault && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
                    Default
                  </span>
                )}
                {!bank.isActive && (
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Inactive
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showDialog && (
        <BankAccountDialog
          bank={editingBank}
          onClose={() => { setShowDialog(false); setEditingBank(null); }}
          onSaved={() => { setShowDialog(false); setEditingBank(null); mutate(); }}
        />
      )}
    </AccountingPageShell>
  );
}

// ── Bank Account Dialog ──────────────────────────────────────

function BankAccountDialog({
  bank,
  onClose,
  onSaved,
}: {
  bank: BankAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { saveBankAccount } = useBankAccountMutations();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    name: bank?.name ?? '',
    glAccountId: bank?.glAccountId ?? '',
    bankName: bank?.bankName ?? '',
    accountNumberLast4: bank?.accountNumberLast4 ?? '',
    isDefault: bank?.isDefault ?? false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = 'Account name is required';
    if (!form.glAccountId) newErrors.glAccountId = 'GL account is required';
    if (form.accountNumberLast4 && form.accountNumberLast4.length > 4) {
      newErrors.accountNumberLast4 = 'Max 4 digits';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      await saveBankAccount.mutateAsync({
        id: bank?.id,
        name: form.name.trim(),
        glAccountId: form.glAccountId,
        bankName: form.bankName.trim() || null,
        accountNumberLast4: form.accountNumberLast4.trim() || null,
        isDefault: form.isDefault,
      });
      toast.success(bank ? 'Bank account updated' : 'Bank account created');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold text-foreground">
          {bank ? 'Edit Bank Account' : 'New Bank Account'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Account Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Operating Checking"
              className={`w-full rounded-lg border bg-surface px-3 py-2 text-sm focus:ring-2 focus:outline-none ${
                errors.name ? 'border-red-500/40 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-indigo-500 focus:ring-indigo-500'
              }`}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              GL Account <span className="text-red-500">*</span>
            </label>
            <AccountPicker
              value={form.glAccountId || null}
              onChange={(v) => setForm((f) => ({ ...f, glAccountId: v ?? '' }))}
            />
            {errors.glAccountId && <p className="mt-1 text-xs text-red-500">{errors.glAccountId}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bank Name</label>
            <input
              type="text"
              value={form.bankName}
              onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
              placeholder="e.g., Chase, Wells Fargo"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Last 4 Digits</label>
            <input
              type="text"
              value={form.accountNumberLast4}
              onChange={(e) => setForm((f) => ({ ...f, accountNumberLast4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              placeholder="1234"
              maxLength={4}
              className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            {errors.accountNumberLast4 && <p className="mt-1 text-xs text-red-500">{errors.accountNumberLast4}</p>}
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-foreground">Set as default bank account</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
