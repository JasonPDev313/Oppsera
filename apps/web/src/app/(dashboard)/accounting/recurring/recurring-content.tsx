'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Play, Calendar, Clock, Pause, History, AlertCircle } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountPicker } from '@/components/accounting/account-picker';
import {
  useRecurringTemplates,
  useRecurringTemplate,
  useRecurringTemplateHistory,
  useRecurringTemplateMutations,
} from '@/hooks/use-recurring-templates';
import type {
  RecurringTemplate,
  RecurringFrequency,
  RecurringTemplateHistoryEntry,
} from '@/types/accounting';
import { formatAccountingMoney, RECURRING_FREQUENCY_CONFIG } from '@/types/accounting';

// ── Status Badge ────────────────────────────────────────────

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        isActive ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

// ── Template Form Dialog ────────────────────────────────────

interface TemplateFormLine {
  accountId: string;
  debitAmount: string;
  creditAmount: string;
  memo: string;
}

interface TemplateFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description?: string;
    frequency: string;
    dayOfPeriod: number;
    startDate: string;
    endDate?: string;
    templateLines: Array<{
      accountId: string;
      debitAmount: string;
      creditAmount: string;
      memo?: string;
    }>;
  }) => Promise<void>;
  initial?: RecurringTemplate | null;
  isSaving: boolean;
}

function TemplateFormDialog({ open, onClose, onSave, initial, isSaving }: TemplateFormDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    (initial?.frequency as RecurringFrequency) ?? 'monthly',
  );
  const [dayOfPeriod, setDayOfPeriod] = useState(initial?.dayOfPeriod ?? 1);
  const [startDate, setStartDate] = useState(initial?.startDate ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [lines, setLines] = useState<TemplateFormLine[]>(
    initial?.templateLines?.map((l) => ({
      accountId: l.accountId,
      debitAmount: l.debitAmount || '',
      creditAmount: l.creditAmount || '',
      memo: l.memo ?? '',
    })) ?? [
      { accountId: '', debitAmount: '', creditAmount: '', memo: '' },
      { accountId: '', debitAmount: '', creditAmount: '', memo: '' },
    ],
  );
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const addLine = () => {
    setLines([...lines, { accountId: '', debitAmount: '', creditAmount: '', memo: '' }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof TemplateFormLine, value: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, [field]: value };
    setLines(updated);
  };

  const totalDebits = lines.reduce((sum, l) => sum + Number(l.debitAmount || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + Number(l.creditAmount || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  const handleSubmit = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!isBalanced) {
      setError('Debits and credits must balance');
      return;
    }
    if (lines.some((l) => !l.accountId)) {
      setError('All lines must have an account selected');
      return;
    }

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        frequency,
        dayOfPeriod,
        startDate,
        endDate: endDate || undefined,
        templateLines: lines.map((l) => ({
          accountId: l.accountId,
          debitAmount: l.debitAmount || '0',
          creditAmount: l.creditAmount || '0',
          memo: l.memo || undefined,
        })),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4">
        <div className="p-6 space-y-5">
          <h2 className="text-lg font-semibold text-foreground">
            {initial ? 'Edit Recurring Template' : 'New Recurring Template'}
          </h2>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Name & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-border bg-surface rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Monthly depreciation"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-border bg-surface rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Optional description"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                className="w-full px-3 py-2 border border-border bg-surface rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {(Object.entries(RECURRING_FREQUENCY_CONFIG) as [RecurringFrequency, { label: string }][]).map(
                  ([value, cfg]) => (
                    <option key={value} value={value}>
                      {cfg.label}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Day of Period</label>
              <input
                type="number"
                min={0}
                max={28}
                value={dayOfPeriod}
                onChange={(e) => setDayOfPeriod(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border border-border bg-surface rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-muted-foreground mt-0.5">0 = last day</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-border bg-surface rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-border bg-surface rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-muted-foreground mt-0.5">Optional</p>
            </div>
          </div>

          {/* Journal Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">Journal Lines</label>
              <button
                type="button"
                onClick={addLine}
                className="text-xs text-indigo-500 hover:text-indigo-500 font-medium"
              >
                + Add Line
              </button>
            </div>

            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Account</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Debit</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Credit</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-32">Memo</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">
                        <AccountPicker
                          value={line.accountId || null}
                          onChange={(id) => updateLine(i, 'accountId', id ?? '')}
                          placeholder="Select account"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.debitAmount}
                          onChange={(e) => updateLine(i, 'debitAmount', e.target.value)}
                          className="w-full px-2 py-1 border border-border rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.creditAmount}
                          onChange={(e) => updateLine(i, 'creditAmount', e.target.value)}
                          className="w-full px-2 py-1 border border-border rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={line.memo}
                          onChange={(e) => updateLine(i, 'memo', e.target.value)}
                          className="w-full px-2 py-1 border border-border bg-surface rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="Memo"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {lines.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeLine(i)}
                            className="text-muted-foreground hover:text-red-500 text-xs"
                          >
                            &times;
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted">
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium text-foreground">Totals</td>
                    <td className="px-3 py-2 text-sm text-right font-medium">
                      {formatAccountingMoney(totalDebits)}
                    </td>
                    <td className="px-3 py-2 text-sm text-right font-medium">
                      {formatAccountingMoney(totalCredits)}
                    </td>
                    <td className="px-3 py-2">
                      {!isBalanced && (
                        <span className="text-xs text-red-500 font-medium">Unbalanced</span>
                      )}
                      {isBalanced && totalDebits > 0 && (
                        <span className="text-xs text-green-500 font-medium">Balanced</span>
                      )}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground bg-surface border border-border rounded-md hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : initial ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── History Panel ───────────────────────────────────────────

function HistoryPanel({ templateId }: { templateId: string }) {
  const { data: history, isLoading } = useRecurringTemplateHistory(templateId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading history...</p>;
  if (history.length === 0) return <p className="text-sm text-muted-foreground">No entries posted yet.</p>;

  return (
    <table className="w-full text-sm">
      <thead className="bg-muted">
        <tr>
          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Journal #</th>
          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Business Date</th>
          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Posted At</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {history.map((entry: RecurringTemplateHistoryEntry) => (
          <tr key={entry.id}>
            <td className="px-3 py-2 font-mono text-foreground">{entry.journalNumber}</td>
            <td className="px-3 py-2 text-foreground">{entry.businessDate}</td>
            <td className="px-3 py-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  entry.status === 'posted'
                    ? 'bg-green-500/10 text-green-500'
                    : entry.status === 'voided'
                      ? 'bg-red-500/10 text-red-500'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {entry.status}
              </span>
            </td>
            <td className="px-3 py-2 text-muted-foreground text-xs">
              {entry.postedAt ? new Date(entry.postedAt).toLocaleString() : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Execute Dialog ──────────────────────────────────────────

function ExecuteDialog({
  open,
  onClose,
  template,
  onExecute,
  isExecuting,
}: {
  open: boolean;
  onClose: () => void;
  template: RecurringTemplate;
  onExecute: (businessDate?: string) => Promise<void>;
  isExecuting: boolean;
}) {
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Execute Template</h3>
        <p className="text-sm text-muted-foreground">
          Post journal entry from template <strong>{template.name}</strong> for the selected date.
        </p>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Business Date</label>
          <input
            type="date"
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="w-full px-3 py-2 border border-border bg-surface rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground bg-surface border border-border rounded-md hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              await onExecute(businessDate);
              onClose();
            }}
            disabled={isExecuting}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {isExecuting ? 'Posting...' : 'Post Entry'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Main Content ────────────────────────────────────────────

export default function RecurringContent() {
  const [showActiveOnly, setShowActiveOnly] = useState<boolean | undefined>(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplate | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [executeTemplate, setExecuteTemplate] = useState<RecurringTemplate | null>(null);

  const { items, isLoading } = useRecurringTemplates({
    isActive: showActiveOnly,
  });
  const { data: selectedTemplate } = useRecurringTemplate(selectedTemplateId);
  const mutations = useRecurringTemplateMutations();

  const handleCreate = async (data: Parameters<TemplateFormDialogProps['onSave']>[0]) => {
    await mutations.createTemplate.mutateAsync(data);
  };

  const handleUpdate = async (data: Parameters<TemplateFormDialogProps['onSave']>[0]) => {
    if (!editingTemplate) return;
    await mutations.updateTemplate.mutateAsync({ id: editingTemplate.id, ...data });
  };

  const handleExecute = async (businessDate?: string) => {
    if (!executeTemplate) return;
    await mutations.executeTemplate.mutateAsync({ id: executeTemplate.id, businessDate });
  };

  const handleExecuteDue = async () => {
    await mutations.executeDue.mutateAsync();
  };

  return (
    <AccountingPageShell
      title="Recurring Journal Templates"
      subtitle="Automate monthly accruals, depreciation, and other recurring entries"
      breadcrumbs={[{ label: 'Recurring Templates' }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExecuteDue}
            disabled={mutations.executeDue.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground bg-surface border border-border rounded-md hover:bg-accent disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {mutations.executeDue.isPending ? 'Running...' : 'Run All Due'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingTemplate(null);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Template
          </button>
        </div>
      }
    >
      {/* Filter Tabs */}
      <div className="flex items-center gap-4 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setShowActiveOnly(true)}
          className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
            showActiveOnly === true
              ? 'border-indigo-600 text-indigo-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Active
        </button>
        <button
          type="button"
          onClick={() => setShowActiveOnly(undefined)}
          className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
            showActiveOnly === undefined
              ? 'border-indigo-600 text-indigo-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setShowActiveOnly(false)}
          className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
            showActiveOnly === false
              ? 'border-indigo-600 text-indigo-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Inactive
        </button>
      </div>

      {/* Templates Table */}
      {isLoading ? (
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
          <Calendar className="h-8 w-8 text-muted-foreground" />
          <p>No recurring templates found</p>
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Frequency</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Next Due</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Posted</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((template: RecurringTemplate) => (
                <tr
                  key={template.id}
                  className={`hover:bg-accent cursor-pointer ${
                    selectedTemplateId === template.id ? 'bg-indigo-500/10' : ''
                  }`}
                  onClick={() =>
                    setSelectedTemplateId(
                      selectedTemplateId === template.id ? null : template.id,
                    )
                  }
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{template.name}</div>
                    {template.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{template.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {RECURRING_FREQUENCY_CONFIG[template.frequency as RecurringFrequency]?.label ?? template.frequency}
                      {template.dayOfPeriod === 0 ? ' (last day)' : ` (day ${template.dayOfPeriod})`}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {template.nextDueDate ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {template.lastPostedPeriod ?? 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge isActive={template.isActive} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {template.isActive && (
                        <button
                          type="button"
                          onClick={() => setExecuteTemplate(template)}
                          className="p-1.5 text-muted-foreground hover:text-indigo-500 rounded hover:bg-indigo-500/100/10"
                          title="Execute now"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTemplate(template);
                          setShowForm(true);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent"
                        title="Edit"
                      >
                        <Calendar className="h-4 w-4" />
                      </button>
                      {template.isActive && (
                        <button
                          type="button"
                          onClick={async () => {
                            await mutations.deactivateTemplate.mutateAsync(template.id);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-amber-500 rounded hover:bg-amber-500/10"
                          title="Deactivate"
                        >
                          <Pause className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* History Panel (expanded when a template is selected) */}
      {selectedTemplateId && (
        <div className="mt-4 border border-border rounded-md">
          <div className="px-4 py-3 bg-muted border-b border-border flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Posting History: {selectedTemplate?.name ?? '...'}
            </span>
          </div>
          <div className="p-2">
            <HistoryPanel templateId={selectedTemplateId} />
          </div>
        </div>
      )}

      {/* Form Dialog */}
      <TemplateFormDialog
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingTemplate(null);
        }}
        onSave={editingTemplate ? handleUpdate : handleCreate}
        initial={editingTemplate}
        isSaving={mutations.createTemplate.isPending || mutations.updateTemplate.isPending}
      />

      {/* Execute Dialog */}
      {executeTemplate && (
        <ExecuteDialog
          open={!!executeTemplate}
          onClose={() => setExecuteTemplate(null)}
          template={executeTemplate}
          onExecute={handleExecute}
          isExecuting={mutations.executeTemplate.isPending}
        />
      )}
    </AccountingPageShell>
  );
}
