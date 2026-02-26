'use client';

import { useState } from 'react';
import { Check, Clock, DollarSign } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useBreakageReview, useBreakageMutations } from '@/hooks/use-breakage-review';
import { useToast } from '@/components/ui/toast';
import { formatAccountingMoney, BREAKAGE_STATUS_CONFIG } from '@/types/accounting';
import type { BreakageReviewItem, BreakageReviewStatus } from '@/types/accounting';

const STATUS_TABS: Array<{ value: BreakageReviewStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
];

function ReviewDialog({
  item,
  onClose,
  onSubmit,
}: {
  item: BreakageReviewItem;
  onClose: () => void;
  onSubmit: (action: 'approve' | 'decline', notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async (action: 'approve' | 'decline') => {
    setIsSubmitting(true);
    try {
      await onSubmit(action, notes);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
        <h3 className="text-lg font-semibold mb-4">Review Breakage</h3>

        <div className="space-y-3 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Voucher</span>
            <span className="font-medium">{item.voucherNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">
              {formatAccountingMoney(item.amountCents / 100)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Expired</span>
            <span className="font-medium">
              {new Date(item.expiredAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for approval or decline..."
            rows={3}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none bg-surface"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleAction('decline')}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border border-red-500/40 px-4 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => handleAction('approve')}
            disabled={isSubmitting}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BreakageReviewStatus }) {
  const config = BREAKAGE_STATUS_CONFIG[status];
  const colors: Record<string, string> = {
    warning: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    success: 'bg-green-500/10 text-green-500 border-green-500/30',
    error: 'bg-red-500/10 text-red-500 border-red-500/30',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[config.variant] ?? colors.warning}`}
    >
      {config.label}
    </span>
  );
}

export default function BreakageContent() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [reviewItem, setReviewItem] = useState<BreakageReviewItem | null>(null);
  const { toast } = useToast();

  const { items, stats, isLoading, meta, refetch } = useBreakageReview({
    status: statusFilter || undefined,
  });

  const { reviewBreakage } = useBreakageMutations();

  const handleReview = async (action: 'approve' | 'decline', notes: string) => {
    if (!reviewItem) return;
    try {
      await reviewBreakage.mutateAsync({
        id: reviewItem.id,
        action,
        notes: notes || undefined,
      });
      toast.success(action === 'approve' ? 'Breakage approved and posted to GL' : 'Breakage declined');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to review breakage');
    }
  };

  return (
    <AccountingPageShell
      title="Breakage Review"
      subtitle="Review and approve expired voucher breakage income recognition"
      breadcrumbs={[{ label: 'Breakage Review' }]}
    >
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
            <Clock className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{stats.pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pending Reviews</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20">
            <DollarSign className="h-5 w-5 text-indigo-500" />
          </div>
          <div>
            <p className="text-2xl font-semibold">
              {formatAccountingMoney(stats.pendingAmountCents / 100)}
            </p>
            <p className="text-xs text-muted-foreground">Pending Amount</p>
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-indigo-600 text-white'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Voucher
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Expired
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Reviewed
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {statusFilter === 'pending' ? (
                    <div className="flex flex-col items-center gap-2">
                      <Check className="h-8 w-8 text-green-500" />
                      <p>No pending breakage reviews</p>
                    </div>
                  ) : (
                    'No breakage reviews found'
                  )}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-accent transition-colors">
                  <td className="px-4 py-3 text-sm font-medium">{item.voucherNumber}</td>
                  <td className="px-4 py-3 text-right text-sm font-mono">
                    {formatAccountingMoney(item.amountCents / 100)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(item.expiredAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {item.reviewedAt
                      ? new Date(item.reviewedAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => setReviewItem(item)}
                        className="inline-flex items-center gap-1 rounded-md border border-indigo-500/40 px-2.5 py-1 text-xs font-medium text-indigo-500 transition-colors hover:bg-indigo-500/10"
                      >
                        Review
                      </button>
                    ) : item.glJournalEntryId ? (
                      <span className="text-xs text-muted-foreground">GL Posted</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Load More */}
      {meta.hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              /* cursor pagination would go here — for now the initial load is sufficient */
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Load More
          </button>
        </div>
      )}

      {/* Review Dialog */}
      {reviewItem && (
        <ReviewDialog
          item={reviewItem}
          onClose={() => setReviewItem(null)}
          onSubmit={handleReview}
        />
      )}
    </AccountingPageShell>
  );
}
