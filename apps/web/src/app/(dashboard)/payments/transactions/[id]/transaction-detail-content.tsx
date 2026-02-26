'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  RefreshCw,
  Ban,
  RotateCcw,
  AlertCircle,
  Clock,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import {
  useTransactionDetail,
  useTransactionActions,
  type TransactionRecord,
} from '@/hooks/use-transactions';

// ── Status config ────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  authorized: 'Authorized',
  capture_pending: 'Capture Pending',
  captured: 'Captured',
  voided: 'Voided',
  refund_pending: 'Refund Pending',
  refunded: 'Refunded',
  declined: 'Declined',
  error: 'Error',
  resolved: 'Resolved',
};

const STATUS_COLORS: Record<string, string> = {
  created: 'bg-gray-500/10 text-muted-foreground',
  authorized: 'bg-blue-500/10 text-blue-500',
  capture_pending: 'bg-yellow-500/10 text-yellow-500',
  captured: 'bg-green-500/10 text-green-500',
  voided: 'bg-red-500/10 text-red-500',
  refund_pending: 'bg-orange-500/10 text-orange-500',
  refunded: 'bg-purple-500/10 text-purple-500',
  declined: 'bg-red-500/10 text-red-500',
  error: 'bg-red-500/20 text-red-500',
  resolved: 'bg-gray-500/20 text-muted-foreground',
};

const TXN_TYPE_ICONS: Record<string, typeof Clock> = {
  authorization: CheckCircle2,
  capture: CheckCircle2,
  sale: CheckCircle2,
  void: Ban,
  refund: RotateCcw,
  inquiry: RefreshCw,
};

const RESPONSE_COLORS: Record<string, string> = {
  approved: 'text-green-500',
  declined: 'text-red-500',
  retry: 'text-yellow-500',
  error: 'text-red-500',
};

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '--';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? 'bg-gray-500/10 text-muted-foreground';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${colors}`}>
      {label}
    </span>
  );
}

// ── Main content ─────────────────────────────────────────────

export default function TransactionDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data, isLoading, error, refetch } = useTransactionDetail(id);
  const { voidTransaction, refundTransaction, inquireTransaction } = useTransactionActions();

  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <button
          onClick={() => router.push('/payments/transactions')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Transactions
        </button>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-400" aria-hidden="true" />
          <p className="mt-2 text-sm text-red-500">
            {error ? 'Failed to load transaction details.' : 'Transaction not found.'}
          </p>
        </div>
      </div>
    );
  }

  const canVoid = data.status === 'authorized' || data.status === 'captured';
  const canRefund = data.status === 'captured' && (data.refundedAmountCents ?? 0) < (data.capturedAmountCents ?? data.amountCents);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push('/payments/transactions')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Transactions
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              Transaction Detail
            </h1>
            <StatusBadge status={data.status} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => inquireTransaction.mutate(id)}
              disabled={inquireTransaction.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              {inquireTransaction.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              Refresh Status
            </button>
            {canVoid && (
              <button
                onClick={() => setShowVoidDialog(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-surface px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10"
              >
                <Ban className="h-4 w-4" aria-hidden="true" />
                Void
              </button>
            )}
            {canRefund && (
              <button
                onClick={() => setShowRefundDialog(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Refund
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <InfoCard label="Amount" value={formatCents(data.amountCents)} />
        <InfoCard label="Authorized" value={formatCents(data.authorizedAmountCents)} />
        <InfoCard label="Captured" value={formatCents(data.capturedAmountCents)} />
        <InfoCard
          label="Refunded"
          value={formatCents(data.refundedAmountCents)}
          valueClass={data.refundedAmountCents ? 'text-red-500' : undefined}
        />
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Payment info */}
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Payment Information</h2>
          </div>
          <dl className="divide-y divide-border px-4">
            <DetailRow label="Payment Method" value={data.paymentMethodType} />
            {data.cardLast4 && (
              <DetailRow
                label="Card"
                value={`${data.cardBrand ?? ''} ****${data.cardLast4}`}
              />
            )}
            {data.token && (
              <DetailRow label="Token" value={data.token.slice(0, 12) + '...'} mono />
            )}
            <DetailRow label="Currency" value={data.currency} />
            <DetailRow label="Created" value={formatDateTime(data.createdAt)} />
            <DetailRow label="Updated" value={formatDateTime(data.updatedAt)} />
          </dl>
        </div>

        {/* Reference info */}
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">References</h2>
          </div>
          <dl className="divide-y divide-border px-4">
            <DetailRow label="Intent ID" value={data.id} mono />
            <DetailRow label="Idempotency Key" value={data.idempotencyKey} mono />
            {data.orderId && <DetailRow label="Order ID" value={data.orderId} mono />}
            {data.tenderId && <DetailRow label="Tender ID" value={data.tenderId} mono />}
            {data.customerId && <DetailRow label="Customer ID" value={data.customerId} mono />}
            <DetailRow label="Provider ID" value={data.providerId} mono />
            <DetailRow label="Merchant Account" value={data.merchantAccountId} mono />
            <DetailRow label="Created By" value={data.createdBy} mono />
          </dl>
        </div>
      </div>

      {/* Error message */}
      {data.errorMessage && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-red-500">Error Message</p>
            <p className="text-sm text-red-500 mt-1">{data.errorMessage}</p>
          </div>
        </div>
      )}

      {/* Transaction records timeline */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Transaction Records ({data.transactions.length})
          </h2>
        </div>
        {data.transactions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No transaction records yet
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.transactions.map((rec) => (
              <TransactionRecordRow key={rec.id} record={rec} />
            ))}
          </div>
        )}
      </div>

      {/* Metadata */}
      {data.metadata && Object.keys(data.metadata).length > 0 && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Metadata</h2>
          </div>
          <pre className="px-4 py-3 text-xs text-foreground overflow-x-auto">
            {JSON.stringify(data.metadata, null, 2)}
          </pre>
        </div>
      )}

      {/* Void dialog */}
      {showVoidDialog &&
        createPortal(
          <VoidDialog
            amount={formatCents(data.amountCents)}
            onConfirm={() => {
              voidTransaction.mutate(id, {
                onSuccess: () => {
                  setShowVoidDialog(false);
                  refetch();
                },
              });
            }}
            onClose={() => setShowVoidDialog(false)}
            isPending={voidTransaction.isPending}
          />,
          document.body,
        )}

      {/* Refund dialog */}
      {showRefundDialog &&
        createPortal(
          <RefundDialog
            maxCents={(data.capturedAmountCents ?? data.amountCents) - (data.refundedAmountCents ?? 0)}
            onConfirm={(amountCents?: number) => {
              refundTransaction.mutate(
                { id, amountCents },
                {
                  onSuccess: () => {
                    setShowRefundDialog(false);
                    refetch();
                  },
                },
              );
            }}
            onClose={() => setShowRefundDialog(false)}
            isPending={refundTransaction.isPending}
          />,
          document.body,
        )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function InfoCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${valueClass ?? 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-sm text-foreground ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function TransactionRecordRow({ record }: { record: TransactionRecord }) {
  const Icon = TXN_TYPE_ICONS[record.transactionType] ?? Clock;
  const responseColor = RESPONSE_COLORS[record.responseStatus] ?? 'text-muted-foreground';

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5">
        <Icon className={`h-4 w-4 ${responseColor}`} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground capitalize">
            {record.transactionType}
          </p>
          <p className="text-sm font-medium text-foreground">
            {formatCents(record.amountCents)}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className={`font-medium ${responseColor}`}>
            {record.responseStatus}
          </span>
          {record.authCode && <span>Auth: {record.authCode}</span>}
          {record.providerRef && (
            <span className="font-mono">Ref: {record.providerRef}</span>
          )}
          {record.responseCode && <span>Code: {record.responseCode}</span>}
        </div>
        {record.responseText && (
          <p className="text-xs text-muted-foreground mt-0.5">{record.responseText}</p>
        )}
        {(record.avsResponse || record.cvvResponse) && (
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            {record.avsResponse && <span>AVS: {record.avsResponse}</span>}
            {record.cvvResponse && <span>CVV: {record.cvvResponse}</span>}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDateTime(record.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ── Dialogs ──────────────────────────────────────────────────

function VoidDialog({
  amount,
  onConfirm,
  onClose,
  isPending,
}: {
  amount: string;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative rounded-lg bg-surface shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-foreground">Void Transaction</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Are you sure you want to void this transaction for{' '}
          <span className="font-semibold">{amount}</span>? This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Void Transaction
          </button>
        </div>
      </div>
    </div>
  );
}

function RefundDialog({
  maxCents,
  onConfirm,
  onClose,
  isPending,
}: {
  maxCents: number;
  onConfirm: (amountCents?: number) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = useState('');

  const handleSubmit = () => {
    if (refundType === 'full') {
      onConfirm(undefined);
    } else {
      const cents = Math.round(parseFloat(partialAmount) * 100);
      if (isNaN(cents) || cents <= 0 || cents > maxCents) return;
      onConfirm(cents);
    }
  };

  const maxDollars = (maxCents / 100).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative rounded-lg bg-surface shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-foreground">Refund Transaction</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Maximum refundable amount:{' '}
          <span className="font-semibold">${maxDollars}</span>
        </p>
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={refundType === 'full'}
              onChange={() => setRefundType('full')}
              className="text-indigo-600"
            />
            <span className="text-sm text-foreground">
              Full refund (${maxDollars})
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={refundType === 'partial'}
              onChange={() => setRefundType('partial')}
              className="text-indigo-600"
            />
            <span className="text-sm text-foreground">Partial refund</span>
          </label>
          {refundType === 'partial' && (
            <div className="ml-6">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={maxDollars}
                  placeholder="0.00"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  className="block w-full rounded-md border border-border bg-surface pl-7 pr-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Process Refund
          </button>
        </div>
      </div>
    </div>
  );
}
