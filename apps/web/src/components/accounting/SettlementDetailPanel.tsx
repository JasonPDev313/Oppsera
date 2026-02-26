'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, XCircle, FileCheck, AlertTriangle } from 'lucide-react';
import { useSettlement, useSettlementMutations } from '@/hooks/use-settlements';
import { formatAccountingMoney, SETTLEMENT_STATUS_CONFIG } from '@/types/accounting';
import type { SettlementLine } from '@/types/accounting';

interface SettlementDetailPanelProps {
  settlementId: string;
  onClose: () => void;
  onRefresh: () => void;
}

export function SettlementDetailPanel({
  settlementId,
  onClose,
  onRefresh,
}: SettlementDetailPanelProps) {
  const { data: settlement, isLoading, refetch } = useSettlement(settlementId);
  const { postSettlement, voidSettlement } = useSettlementMutations();
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [actionError, setActionError] = useState('');

  const handlePost = useCallback(async (force = false) => {
    setActionError('');
    try {
      await postSettlement.mutateAsync({ settlementId, force });
      refetch();
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Post failed';
      if (msg.includes('unmatched') && !force) {
        setActionError('Settlement has unmatched tenders. Click "Force Post" to override.');
      } else {
        setActionError(msg);
      }
    }
  }, [settlementId, postSettlement, refetch, onRefresh]);

  const handleVoid = useCallback(async () => {
    if (!voidReason.trim()) return;
    setActionError('');
    try {
      await voidSettlement.mutateAsync({ settlementId, reason: voidReason.trim() });
      setShowVoidDialog(false);
      refetch();
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Void failed');
    }
  }, [settlementId, voidReason, voidSettlement, refetch, onRefresh]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-surface w-full max-w-2xl shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-foreground">Settlement Detail</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {isLoading || !settlement ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Processor</p>
                <p className="text-sm font-medium">{settlement.processorName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Settlement Date</p>
                <p className="text-sm font-medium">{settlement.settlementDate}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Batch ID</p>
                <p className="text-sm font-mono">{settlement.processorBatchId ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <SettlementStatusBadge status={settlement.status} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bank Account</p>
                <p className="text-sm">{settlement.bankAccountName ?? 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Import Source</p>
                <p className="text-sm capitalize">{settlement.importSource}</p>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-muted rounded-lg p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Financial Summary</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross Amount</span>
                  <span className="font-medium">{formatAccountingMoney(settlement.grossAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Processing Fees</span>
                  <span className="font-medium text-red-500">
                    ({formatAccountingMoney(settlement.feeAmount)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net Deposit</span>
                  <span className="font-semibold">{formatAccountingMoney(settlement.netAmount)}</span>
                </div>
                {settlement.chargebackAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Chargebacks</span>
                    <span className="font-medium text-red-500">
                      ({formatAccountingMoney(settlement.chargebackAmount)})
                    </span>
                  </div>
                )}
              </div>
              {settlement.glJournalEntryId && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    GL Journal: <span className="font-mono">{settlement.glJournalEntryId}</span>
                  </p>
                </div>
              )}
            </div>

            {/* GL Preview */}
            {(settlement.status === 'pending' || settlement.status === 'matched') && (
              <div className="bg-blue-500/10 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-500 mb-2">GL Preview</h3>
                <div className="text-xs space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span>Dr Bank Account</span>
                    <span>{formatAccountingMoney(settlement.netAmount)}</span>
                  </div>
                  {settlement.feeAmount > 0 && (
                    <div className="flex justify-between">
                      <span>Dr Processing Fee Expense</span>
                      <span>{formatAccountingMoney(settlement.feeAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-blue-500">
                    <span>Cr Undeposited Funds</span>
                    <span>{formatAccountingMoney(settlement.grossAmount)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Lines */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">
                Settlement Lines ({settlement.lines.length})
              </h3>

              {settlement.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No lines</p>
              ) : (
                <div className="divide-y divide-border">
                  {settlement.lines.map((line) => (
                    <SettlementLineRow key={line.id} line={line} />
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            {actionError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-red-500">{actionError}</p>
                  {actionError.includes('unmatched') && (
                    <button
                      onClick={() => handlePost(true)}
                      className="mt-2 text-xs px-2 py-1 rounded bg-red-500/20 text-red-500 hover:bg-red-500/30 font-medium"
                    >
                      Force Post
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {(settlement.status === 'pending' || settlement.status === 'matched') && (
                <button
                  onClick={() => handlePost()}
                  disabled={postSettlement.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-500 disabled:opacity-50"
                >
                  <FileCheck className="h-4 w-4" />
                  {postSettlement.isPending ? 'Posting...' : 'Post to GL'}
                </button>
              )}
              {settlement.status === 'posted' && (
                <button
                  onClick={() => setShowVoidDialog(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-500 bg-red-500/10 border border-red-500/30 rounded-md hover:bg-red-500/20"
                >
                  <XCircle className="h-4 w-4" />
                  Void
                </button>
              )}
            </div>

            {/* Void Dialog */}
            {showVoidDialog && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-medium text-red-500">Void Settlement</h4>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Reason for voiding..."
                  rows={2}
                  className="w-full rounded-md border border-red-500/30 px-3 py-2 text-sm focus:border-red-500 focus:ring-red-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowVoidDialog(false)}
                    className="px-3 py-1.5 text-sm text-foreground border border-input rounded-md hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleVoid}
                    disabled={!voidReason.trim() || voidSettlement.isPending}
                    className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-500 disabled:opacity-50"
                  >
                    {voidSettlement.isPending ? 'Voiding...' : 'Confirm Void'}
                  </button>
                </div>
              </div>
            )}

            {settlement.notes && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground mb-1">Notes</h3>
                <p className="text-sm text-foreground bg-muted rounded p-3">{settlement.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function SettlementLineRow({ line }: { line: SettlementLine }) {
  return (
    <div className="py-3 flex items-center gap-3">
      <div className="shrink-0">
        {line.status === 'matched' ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            ${(line.settledAmountCents / 100).toFixed(2)}
          </span>
          {line.feeCents > 0 && (
            <span className="text-xs text-red-500">
              fee: ${(line.feeCents / 100).toFixed(2)}
            </span>
          )}
        </div>
        {line.tenderId ? (
          <p className="text-xs text-muted-foreground">
            {line.tenderType ?? 'card'}
            {line.cardBrand ? ` · ${line.cardBrand}` : ''}
            {line.cardLast4 ? ` ****${line.cardLast4}` : ''}
            {line.tenderBusinessDate ? ` · ${line.tenderBusinessDate}` : ''}
          </p>
        ) : (
          <p className="text-xs text-amber-500">Unmatched — no tender linked</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            line.status === 'matched'
              ? 'bg-green-500/10 text-green-500'
              : line.status === 'disputed'
                ? 'bg-red-500/10 text-red-500'
                : 'bg-amber-500/10 text-amber-500'
          }`}
        >
          {line.status}
        </span>
      </div>
    </div>
  );
}

function SettlementStatusBadge({ status }: { status: string }) {
  const config = SETTLEMENT_STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' };
  const colors: Record<string, string> = {
    warning: 'bg-amber-500/10 text-amber-500',
    info: 'bg-blue-500/10 text-blue-500',
    success: 'bg-green-500/10 text-green-500',
    error: 'bg-red-500/10 text-red-500',
    neutral: 'bg-muted text-foreground',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[config.variant] ?? colors.neutral}`}>
      {config.label}
    </span>
  );
}
