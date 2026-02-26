'use client';

import { useState, useCallback } from 'react';
import {
  FileText,
  Calendar,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useMembershipStatements, useStatementDetail } from '@/hooks/use-membership';
import { apiFetch } from '@/lib/api-client';
import type { StatementEntry, StatementLineEntry } from '@/types/membership';

// ── Helpers ─────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatMoney(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(abs / 100);
  if (cents < 0) return `(${formatted})`;
  return formatted;
}

const STATEMENT_STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  draft: 'neutral',
  sent: 'success',
  overdue: 'destructive',
  paid: 'success',
  void: 'neutral',
};

const LINE_TYPE_LABELS: Record<string, string> = {
  charge: 'Charge',
  payment: 'Payment',
  credit: 'Credit',
  late_fee: 'Late Fee',
  adjustment: 'Adjustment',
  dues: 'Dues',
  initiation: 'Initiation Fee',
};

// ── Statement Line Items ────────────────────────────────────────

function StatementLines({
  accountId,
  statementId,
}: {
  accountId: string;
  statementId: string;
}) {
  const { detail, isLoading, error } = useStatementDetail(accountId, statementId);

  if (isLoading) {
    return (
      <div className="border-t border-border bg-muted/50 px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading line items...
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="border-t border-border bg-muted/50 px-6 py-4">
        <p className="text-sm text-red-500">Failed to load statement details</p>
      </div>
    );
  }

  if (detail.lines.length === 0) {
    return (
      <div className="border-t border-border bg-muted/50 px-6 py-4">
        <p className="text-sm text-muted-foreground">No line items on this statement.</p>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-muted/50 px-6 py-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Line Items ({detail.lines.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 pr-4 font-medium">Description</th>
              <th className="pb-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.lines.map((line: StatementLineEntry) => (
              <tr key={line.id}>
                <td className="py-1.5 pr-4">
                  <Badge variant="neutral">
                    {LINE_TYPE_LABELS[line.lineType] ?? line.lineType}
                  </Badge>
                </td>
                <td className="py-1.5 pr-4 text-foreground">{line.description}</td>
                <td className={`py-1.5 text-right font-medium ${
                  line.amountCents < 0 ? 'text-green-500' : 'text-foreground'
                }`}>
                  {formatMoney(line.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Generate Statement Modal ────────────────────────────────────

function GenerateStatementModal({
  accountId,
  onClose,
  onSuccess,
}: {
  accountId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!periodStart || !periodEnd || !dueDate) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/membership/accounts/${accountId}/statements`, {
        method: 'POST',
        body: JSON.stringify({
          periodStart,
          periodEnd,
          dueDate,
        }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate statement');
    } finally {
      setIsSubmitting(false);
    }
  }, [accountId, periodStart, periodEnd, dueDate, onSuccess, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-foreground">Generate Statement</h3>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Period Start
          </label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Period End
          </label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!periodStart || !periodEnd || !dueDate || isSubmitting}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </span>
            ) : (
              'Generate'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Statement Row ───────────────────────────────────────────────

function StatementRow({
  statement,
  accountId,
  isExpanded,
  onToggle,
}: {
  statement: StatementEntry;
  accountId: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer hover:bg-accent/50"
        onClick={onToggle}
      >
        <td className="py-2 pr-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="py-2 pr-4 text-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {formatDate(statement.periodStart)} - {formatDate(statement.periodEnd)}
          </div>
        </td>
        <td className="py-2 pr-4 text-right text-muted-foreground">
          {formatMoney(statement.openingBalanceCents)}
        </td>
        <td className="py-2 pr-4 text-right text-foreground">
          {formatMoney(statement.chargesCents)}
        </td>
        <td className="py-2 pr-4 text-right text-green-500">
          {statement.paymentsCents > 0 ? formatMoney(statement.paymentsCents) : '--'}
        </td>
        <td className="py-2 pr-4 text-right font-medium text-foreground">
          {formatMoney(statement.closingBalanceCents)}
        </td>
        <td className="py-2 pr-4">
          <Badge variant={STATEMENT_STATUS_VARIANTS[statement.status] ?? 'neutral'}>
            {statement.status}
          </Badge>
        </td>
        <td className="py-2 text-muted-foreground">
          {formatDate(statement.dueDate)}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <StatementLines accountId={accountId} statementId={statement.id} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function StatementsSubTab({ accountId }: { accountId: string }) {
  const { statements, isLoading, error, mutate } = useMembershipStatements(accountId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
        <AlertCircle className="h-6 w-6 text-red-400" />
        <p className="text-sm">Failed to load statements</p>
        <button
          type="button"
          onClick={mutate}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-500"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (statements.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3 p-4 text-muted-foreground">
        <FileText className="h-6 w-6" />
        <p className="text-sm font-medium text-muted-foreground">No Statements</p>
        <p className="text-xs">No billing statements have been generated for this account.</p>
        <button
          type="button"
          onClick={() => setShowGenerate(true)}
          className="mt-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Generate Statement
        </button>
        {showGenerate && (
          <GenerateStatementModal
            accountId={accountId}
            onClose={() => setShowGenerate(false)}
            onSuccess={mutate}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4.5 w-4.5 text-indigo-600" />
          Statements ({statements.length})
        </h3>
        <button
          type="button"
          onClick={() => setShowGenerate(true)}
          className="rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          Generate Statement
        </button>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pl-4 pr-2 pt-3 font-medium" />
                <th className="pb-2 pr-4 pt-3 font-medium">Period</th>
                <th className="pb-2 pr-4 pt-3 font-medium text-right">Opening</th>
                <th className="pb-2 pr-4 pt-3 font-medium text-right">Charges</th>
                <th className="pb-2 pr-4 pt-3 font-medium text-right">Payments</th>
                <th className="pb-2 pr-4 pt-3 font-medium text-right">Closing</th>
                <th className="pb-2 pr-4 pt-3 font-medium">Status</th>
                <th className="pb-2 pr-4 pt-3 font-medium">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {statements.map((stmt) => (
                <StatementRow
                  key={stmt.id}
                  statement={stmt}
                  accountId={accountId}
                  isExpanded={expandedId === stmt.id}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === stmt.id ? null : stmt.id))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showGenerate && (
        <GenerateStatementModal
          accountId={accountId}
          onClose={() => setShowGenerate(false)}
          onSuccess={mutate}
        />
      )}
    </div>
  );
}
