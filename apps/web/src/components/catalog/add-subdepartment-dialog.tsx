'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, ChevronRight } from 'lucide-react';
import { AccountPicker, getTopSuggestions } from '@/components/accounting/account-picker';
import { useGLAccounts } from '@/hooks/use-accounting';
import { useMappingMutations } from '@/hooks/use-mappings';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';

interface AddSubDepartmentDialogProps {
  open: boolean;
  onClose: () => void;
  departmentId: string;
  departmentName: string;
  onCreated: () => void;
}

export function AddSubDepartmentDialog({
  open,
  onClose,
  departmentId,
  departmentName,
  onCreated,
}: AddSubDepartmentDialogProps) {
  const { toast } = useToast();
  const { isModuleEnabled } = useEntitlementsContext();
  const accountingEnabled = isModuleEnabled('accounting');

  const [name, setName] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: allAccounts } = useGLAccounts({ isActive: true });
  const revenueAccounts = useMemo(
    () => allAccounts.filter((a) => a.accountType === 'revenue'),
    [allAccounts],
  );

  const topSuggestions = useMemo(
    () => (name.trim().length >= 2 ? getTopSuggestions(revenueAccounts, name.trim(), 'revenue', 3) : []),
    [revenueAccounts, name],
  );

  const { saveSubDepartmentDefaults } = useMappingMutations();

  const resetForm = () => {
    setName('');
    setSelectedAccountId(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }
    setIsSubmitting(true);
    try {
      // Step 1: Create the subdepartment
      const res = await apiFetch<{ data: { id: string } }>('/api/v1/catalog/categories', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, parentId: departmentId, sortOrder: 0 }),
      });
      const newId = res.data.id;

      // Step 2: Save GL mapping if selected (best-effort)
      if (selectedAccountId && accountingEnabled) {
        try {
          await saveSubDepartmentDefaults.mutateAsync({
            subDepartmentId: newId,
            revenueAccountId: selectedAccountId,
            cogsAccountId: null,
            inventoryAssetAccountId: null,
            discountAccountId: null,
            returnsAccountId: null,
          });
        } catch {
          toast.info('Sub-department created, but GL mapping failed. Set it in Accounting > Mappings.');
        }
      }

      toast.success(`"${trimmed}" created`);
      handleClose();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create sub-department');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="relative mx-4 w-full max-w-md rounded-xl border border-gray-200 bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add Sub-Department</h2>
            <p className="text-xs text-gray-500">Under {departmentName}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/50 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Name */}
          <FormField label="Sub-Department Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') handleClose();
              }}
              placeholder="e.g. Beverages, Golf Equipment..."
              className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              autoFocus
            />
          </FormField>

          {/* GL Revenue Account — shown when accounting is enabled */}
          {accountingEnabled && (
            <FormField
              label="Revenue GL Account"
              helpText="Maps this sub-department to a revenue account for GL posting"
            >
              {/* Quick-pick suggestion chips */}
              {topSuggestions.length > 0 && !selectedAccountId && (
                <div className="mb-2 space-y-1.5">
                  {topSuggestions.map((acc, idx) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        idx === 0
                          ? 'border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10'
                          : 'border-gray-200 hover:bg-gray-500/5'
                      }`}
                    >
                      {idx === 0 && <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500" />}
                      <span className="font-mono text-xs text-gray-500">{acc.accountNumber}</span>
                      <span className={idx === 0 ? 'font-medium text-gray-900' : 'text-gray-700'}>
                        {acc.name}
                      </span>
                      {idx === 0 && (
                        <span className="ml-auto rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-600">
                          Recommended
                        </span>
                      )}
                      {idx !== 0 && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Full AccountPicker */}
              <AccountPicker
                value={selectedAccountId}
                onChange={setSelectedAccountId}
                accountTypes={['revenue']}
                suggestFor={name.trim()}
                mappingRole="revenue"
                placeholder="Search all revenue accounts..."
              />
            </FormField>
          )}

          {/* Info nudge when accounting is not enabled */}
          {!accountingEnabled && (
            <div className="rounded-lg border border-gray-200 bg-gray-500/5 px-4 py-3">
              <p className="text-xs text-gray-500">
                Set up Accounting to map sub-departments to GL revenue accounts.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Sub-Department'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
