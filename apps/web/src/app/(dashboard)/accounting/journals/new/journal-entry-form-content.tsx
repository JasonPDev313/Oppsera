'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertTriangle, Check } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountPicker } from '@/components/accounting/account-picker';
import { MoneyInput } from '@/components/accounting/money-input';
import { useJournalMutations } from '@/hooks/use-journals';
import { useToast } from '@/components/ui/toast';

interface FormLine {
  key: string;
  accountId: string | null;
  debitAmount: string;
  creditAmount: string;
  locationId: string | null;
  memo: string;
}

function newLine(): FormLine {
  return {
    key: Math.random().toString(36).slice(2),
    accountId: null,
    debitAmount: '',
    creditAmount: '',
    locationId: null,
    memo: '',
  };
}

export default function JournalEntryFormContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { createJournal } = useJournalMutations();

  const [businessDate, setBusinessDate] = useState(
    new Date().toISOString().split('T')[0]!,
  );
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<FormLine[]>([newLine(), newLine()]);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalDebits = lines.reduce((sum, l) => {
    const n = parseFloat(l.debitAmount);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  const totalCredits = lines.reduce((sum, l) => {
    const n = parseFloat(l.creditAmount);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = difference < 0.01;

  const hasControlAccount = false; // Would check against GL account data

  const updateLine = useCallback((key: string, field: keyof FormLine, value: string | null) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, [field]: value };
        // Clear the opposite column if user enters a value
        if (field === 'debitAmount' && value && value !== '0' && value !== '0.00') {
          updated.creditAmount = '';
        } else if (field === 'creditAmount' && value && value !== '0' && value !== '0.00') {
          updated.debitAmount = '';
        }
        return updated;
      }),
    );
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, newLine()]);
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.key !== key)));
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!businessDate) {
      newErrors.businessDate = 'Business date is required';
    }

    const validLines = lines.filter(
      (l) => l.accountId || l.debitAmount || l.creditAmount,
    );

    if (validLines.length < 2) {
      newErrors.lines = 'At least 2 lines are required';
    }

    for (const line of validLines) {
      if (!line.accountId) {
        newErrors[`line_${line.key}_account`] = 'Account is required';
      }
      const hasDebit = parseFloat(line.debitAmount) > 0;
      const hasCredit = parseFloat(line.creditAmount) > 0;
      if (!hasDebit && !hasCredit) {
        newErrors[`line_${line.key}_amount`] = 'Enter a debit or credit amount';
      }
      if (hasDebit && hasCredit) {
        newErrors[`line_${line.key}_amount`] = 'A line cannot have both debit and credit';
      }
    }

    if (!isBalanced) {
      newErrors.balance = `Entry is out of balance by $${difference.toFixed(2)}`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (autoPost: boolean) => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      const journalLines = lines
        .filter((l) => l.accountId)
        .map((l) => ({
          accountId: l.accountId!,
          debitAmount: parseFloat(l.debitAmount) || 0,
          creditAmount: parseFloat(l.creditAmount) || 0,
          locationId: l.locationId,
          memo: l.memo || null,
        }));

      const result = await createJournal.mutateAsync({
        businessDate,
        memo,
        lines: journalLines,
        autoPost,
      });

      toast.success(autoPost ? 'Journal entry posted' : 'Journal entry saved as draft');
      router.push(`/accounting/journals/${result.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save journal entry');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AccountingPageShell
      title="New Journal Entry"
      breadcrumbs={[
        { label: 'Journals', href: '/accounting/journals' },
        { label: 'New Entry' },
      ]}
    >
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Control account warning */}
        {hasControlAccount && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="text-sm text-amber-500">
              This entry includes control accounts. Posting requires the &apos;Control Account Post&apos; permission.
            </span>
          </div>
        )}

        {/* Header fields */}
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Business Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
                className={`w-full rounded-lg border bg-surface px-3 py-2 text-sm focus:ring-2 focus:outline-none ${
                  errors.businessDate
                    ? 'border-red-500/40 focus:border-red-500 focus:ring-red-500'
                    : 'border-border focus:border-indigo-500 focus:ring-indigo-500'
                }`}
              />
              {errors.businessDate && (
                <p className="mt-1 text-xs text-red-500">{errors.businessDate}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Source</label>
              <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                Manual
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Memo</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Description of this journal entry..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Lines grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Journal Lines
            </h2>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Line
            </button>
          </div>

          {errors.lines && (
            <p className="text-sm text-red-500">{errors.lines}</p>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-[280px]">Account</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-[150px]">Memo</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-[130px]">Debit</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-[130px]">Credit</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <AccountPicker
                          value={line.accountId}
                          onChange={(v) => updateLine(line.key, 'accountId', v)}
                          className="w-full"
                        />
                        {errors[`line_${line.key}_account`] && (
                          <p className="mt-0.5 text-xs text-red-500">{errors[`line_${line.key}_account`]}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={line.memo}
                          onChange={(e) => updateLine(line.key, 'memo', e.target.value)}
                          placeholder="Line memo"
                          className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <MoneyInput
                          value={line.debitAmount}
                          onChange={(v) => updateLine(line.key, 'debitAmount', v)}
                          error={!!errors[`line_${line.key}_amount`]}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <MoneyInput
                          value={line.creditAmount}
                          onChange={(v) => updateLine(line.key, 'creditAmount', v)}
                          error={!!errors[`line_${line.key}_amount`]}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          disabled={lines.length <= 2}
                          className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile layout */}
            <div className="space-y-4 p-4 md:hidden">
              {lines.map((line, idx) => (
                <div key={line.key} className="rounded-lg border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Line {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length <= 2}
                      className="rounded p-1 text-muted-foreground hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <AccountPicker
                    value={line.accountId}
                    onChange={(v) => updateLine(line.key, 'accountId', v)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Debit</label>
                      <MoneyInput
                        value={line.debitAmount}
                        onChange={(v) => updateLine(line.key, 'debitAmount', v)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Credit</label>
                      <MoneyInput
                        value={line.creditAmount}
                        onChange={(v) => updateLine(line.key, 'creditAmount', v)}
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={line.memo}
                    onChange={(e) => updateLine(line.key, 'memo', e.target.value)}
                    placeholder="Line memo"
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Totals bar */}
          <div className="rounded-lg border border-border bg-muted p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-6">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Debits</span>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    ${totalDebits.toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Credits</span>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    ${totalCredits.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isBalanced ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-green-500">
                    <Check className="h-4 w-4" />
                    Balanced
                  </span>
                ) : (
                  <span className="text-sm font-medium text-red-500">
                    Out of balance: ${difference.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
            {errors.balance && (
              <p className="mt-2 text-sm text-red-500">{errors.balance}</p>
            )}
          </div>
        </div>

        {/* Submit buttons */}
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => router.push('/accounting/journals')}
            className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={isSaving}
            className="rounded-lg border border-indigo-500/40 px-6 py-2.5 text-sm font-medium text-indigo-500 hover:bg-indigo-500/10 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={isSaving}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Post Entry'}
          </button>
        </div>
      </div>
    </AccountingPageShell>
  );
}
