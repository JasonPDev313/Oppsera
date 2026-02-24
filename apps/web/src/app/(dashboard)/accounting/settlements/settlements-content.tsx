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
          <h1 className="text-2xl font-bold text-gray-900">Card Settlements</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track card processor settlements, match to tenders, and post to GL
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
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
      <div className="flex gap-1 border-b border-gray-200">
        {(['all', 'pending', 'matched', 'posted', 'disputed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              statusFilter === tab
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
            <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <CreditCard className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No settlements</h3>
          <p className="mt-1 text-sm text-gray-500">
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
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Processor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Fees</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Matching</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-surface">
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
    <div className="bg-surface rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${negative ? 'text-red-600' : 'text-gray-900'}`}>
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
    <tr className="hover:bg-gray-50 cursor-pointer" onClick={onSelect}>
      <td className="px-4 py-3 text-sm text-gray-900">{settlement.settlementDate}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{settlement.processorName}</td>
      <td className="px-4 py-3 text-sm text-gray-500 font-mono">
        {settlement.processorBatchId ?? '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right">
        {formatAccountingMoney(settlement.grossAmount)}
      </td>
      <td className="px-4 py-3 text-sm text-red-600 text-right">
        {settlement.feeAmount > 0 ? formatAccountingMoney(settlement.feeAmount) : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
        {formatAccountingMoney(settlement.netAmount)}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <div className="w-16 bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${matchPercent === 100 ? 'bg-green-500' : 'bg-amber-500'}`}
              style={{ width: `${matchPercent}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">
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
              className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 font-medium"
            >
              Post
            </button>
          )}
          <button
            onClick={onSelect}
            className="text-xs px-2 py-1 rounded bg-gray-50 text-gray-700 hover:bg-gray-100"
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
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-gray-50 text-gray-700 border-gray-200',
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
