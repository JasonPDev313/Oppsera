'use client';

import { useState, useCallback } from 'react';
import { CreditCard, Upload, Plus, ArrowRight } from 'lucide-react';
import { useSettlements, useSettlementMutations } from '@/hooks/use-settlements';
import { formatAccountingMoney, SETTLEMENT_STATUS_CONFIG } from '@/types/accounting';
import type { Settlement } from '@/types/accounting';
import { ImportSettlementDialog } from '@/components/accounting/ImportSettlementDialog';
import { SettlementDetailPanel } from '@/components/accounting/SettlementDetailPanel';
import { useBankAccounts } from '@/hooks/use-mappings';

type StatusFilter = 'all' | 'pending' | 'matched' | 'posted' | 'disputed';

export default function SettlementsContent() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { items, isLoading, refetch } = useSettlements({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });
  const { importCsv, postSettlement } = useSettlementMutations();
  const { data: bankAccounts } = useBankAccounts();

  const handleImport = useCallback(
    async (processorName: string, csvContent: string, bankAccountId?: string) => {
      await importCsv.mutateAsync({ processorName, csvContent, bankAccountId });
      setShowImportDialog(false);
    },
    [importCsv],
  );

  const handlePost = useCallback(
    async (settlementId: string, force?: boolean) => {
      await postSettlement.mutateAsync({ settlementId, force });
    },
    [postSettlement],
  );

  // Summary cards
  const totalGross = items.reduce((sum, s) => sum + s.grossAmount, 0);
  const totalFees = items.reduce((sum, s) => sum + s.feeAmount, 0);
  const totalNet = items.reduce((sum, s) => sum + s.netAmount, 0);
  const totalChargebacks = items.reduce((sum, s) => sum + s.chargebackAmount, 0);
  const matchRate =
    items.length > 0
      ? Math.round(
          (items.reduce((sum, s) => sum + s.matchedLines, 0) /
            Math.max(items.reduce((sum, s) => sum + s.totalLines, 0), 1)) *
            100,
        )
      : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Card Settlements</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track card processor settlements, match to tenders, and post to GL
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-sm font-medium text-foreground border border-border hover:bg-accent"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <SummaryCard label="Gross Settled" value={formatAccountingMoney(totalGross)} />
        <SummaryCard label="Processing Fees" value={formatAccountingMoney(totalFees)} negative />
        <SummaryCard label="Net Deposited" value={formatAccountingMoney(totalNet)} />
        <SummaryCard label="Chargebacks" value={formatAccountingMoney(totalChargebacks)} negative />
        <SummaryCard label="Match Rate" value={`${matchRate}%`} />
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['all', 'pending', 'matched', 'posted', 'disputed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              statusFilter === tab
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {tab === 'all' ? 'All' : SETTLEMENT_STATUS_CONFIG[tab]?.label ?? tab}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <CreditCard className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-medium text-foreground">No settlements</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Import a CSV from your card processor to get started.
          </p>
          <button
            onClick={() => setShowImportDialog(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Import Settlement
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Processor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Batch</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Gross</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Fees</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Net</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Matching</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {items.map((settlement) => (
                <SettlementRow
                  key={settlement.id}
                  settlement={settlement}
                  onSelect={() => setSelectedId(settlement.id)}
                  onPost={() => handlePost(settlement.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <ImportSettlementDialog
          open={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          onImport={handleImport}
          bankAccounts={bankAccounts}
          isLoading={importCsv.isPending}
        />
      )}

      {/* Detail Panel */}
      {selectedId && (
        <SettlementDetailPanel
          settlementId={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={refetch}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${negative ? 'text-red-500' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

function SettlementRow({
  settlement,
  onSelect,
  onPost,
}: {
  settlement: Settlement;
  onSelect: () => void;
  onPost: () => void;
}) {
  const statusConfig = SETTLEMENT_STATUS_CONFIG[settlement.status] ?? {
    label: settlement.status,
    variant: 'neutral',
  };

  const matchPercent =
    settlement.totalLines > 0
      ? Math.round((settlement.matchedLines / settlement.totalLines) * 100)
      : 0;

  return (
    <tr className="hover:bg-accent cursor-pointer" onClick={onSelect}>
      <td className="px-4 py-3 text-sm text-foreground">{settlement.settlementDate}</td>
      <td className="px-4 py-3 text-sm text-foreground">{settlement.processorName}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
        {settlement.processorBatchId ?? '—'}
      </td>
      <td className="px-4 py-3 text-sm text-foreground text-right">
        {formatAccountingMoney(settlement.grossAmount)}
      </td>
      <td className="px-4 py-3 text-sm text-red-500 text-right">
        {settlement.feeAmount > 0 ? formatAccountingMoney(settlement.feeAmount) : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-foreground text-right font-medium">
        {formatAccountingMoney(settlement.netAmount)}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <div className="w-16 bg-muted rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${matchPercent === 100 ? 'bg-green-500' : 'bg-amber-500'}`}
              style={{ width: `${matchPercent}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {settlement.matchedLines}/{settlement.totalLines}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={settlement.status} config={statusConfig} />
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1">
          {settlement.status === 'matched' && (
            <button
              onClick={onPost}
              className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-500 hover:bg-green-500/20 font-medium"
            >
              Post
            </button>
          )}
          <button
            onClick={onSelect}
            className="text-xs px-2 py-1 rounded bg-muted text-foreground hover:bg-accent"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function StatusBadge({ status: _status, config }: { status: string; config: { label: string; variant: string } }) {
  const colors: Record<string, string> = {
    warning: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    info: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    success: 'bg-green-500/10 text-green-500 border-green-500/30',
    error: 'bg-red-500/10 text-red-500 border-red-500/30',
    neutral: 'bg-muted text-foreground border-border',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
        colors[config.variant] ?? colors.neutral
      }`}
    >
      {config.label}
    </span>
  );
}
