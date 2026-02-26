'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Printer } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { StatusBadge } from '@/components/accounting/status-badge';
import { JournalLinesTable } from '@/components/accounting/journal-lines-table';
import { useJournalEntry, useJournalMutations } from '@/hooks/use-journals';
import { SOURCE_MODULE_BADGES } from '@/types/accounting';
import { useToast } from '@/components/ui/toast';

export default function JournalDetailContent() {
  const params = useParams();
  const { toast } = useToast();
  const id = params.id as string;

  const { data: entry, isLoading, mutate } = useJournalEntry(id);
  const { postJournal, voidJournal } = useJournalMutations();

  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

  const handlePost = async () => {
    if (!entry) return;
    setIsPosting(true);
    try {
      await postJournal.mutateAsync(entry.id);
      toast.success('Journal entry posted');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setIsPosting(false);
    }
  };

  const handleVoid = async () => {
    if (!entry || !voidReason.trim()) return;
    setIsVoiding(true);
    try {
      await voidJournal.mutateAsync({ id: entry.id, reason: voidReason.trim() });
      toast.success('Journal entry voided');
      setShowVoidDialog(false);
      setVoidReason('');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to void');
    } finally {
      setIsVoiding(false);
    }
  };

  if (isLoading) {
    return (
      <AccountingPageShell title="Journal Entry" breadcrumbs={[{ label: 'Journals', href: '/accounting/journals' }, { label: 'Loading...' }]}>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </AccountingPageShell>
    );
  }

  if (!entry) {
    return (
      <AccountingPageShell title="Journal Entry" breadcrumbs={[{ label: 'Journals', href: '/accounting/journals' }, { label: 'Not Found' }]}>
        <div className="text-center py-12 text-muted-foreground">Journal entry not found.</div>
      </AccountingPageShell>
    );
  }

  const badge = SOURCE_MODULE_BADGES[entry.sourceModule];

  return (
    <AccountingPageShell
      title={`Journal #${entry.journalNumber}`}
      breadcrumbs={[
        { label: 'Journals', href: '/accounting/journals' },
        { label: `#${entry.journalNumber}` },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {entry.status === 'draft' && (
            <button
              type="button"
              onClick={handlePost}
              disabled={isPosting}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              {isPosting ? 'Posting...' : 'Post'}
            </button>
          )}
          {entry.status === 'posted' && (
            <button
              type="button"
              onClick={() => setShowVoidDialog(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10"
            >
              <XCircle className="h-4 w-4" />
              Void
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      }
    >
      {/* Header info */}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={entry.status} />
          {badge && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              badge.variant === 'success' ? 'bg-green-500/10 text-green-500' :
              badge.variant === 'info' ? 'bg-blue-500/10 text-blue-500' :
              badge.variant === 'purple' ? 'bg-purple-500/10 text-purple-500' :
              badge.variant === 'orange' ? 'bg-orange-500/10 text-orange-500' :
              badge.variant === 'indigo' ? 'bg-indigo-500/10 text-indigo-500' :
              'bg-muted text-muted-foreground'
            }`}>
              {badge.label}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Business Date</p>
            <p className="mt-1 text-sm text-foreground">{entry.businessDate}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Posting Period</p>
            <p className="mt-1 text-sm text-foreground">{entry.postingPeriod}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Currency</p>
            <p className="mt-1 text-sm text-foreground">{entry.currency}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</p>
            <p className="mt-1 text-sm text-foreground">{new Date(entry.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {entry.memo && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Memo</p>
            <p className="mt-1 text-sm text-foreground">{entry.memo}</p>
          </div>
        )}

        {entry.postedAt && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Posted At</p>
            <p className="mt-1 text-sm text-foreground">{new Date(entry.postedAt).toLocaleString()}</p>
          </div>
        )}

        {entry.voidedAt && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-1">
            <p className="text-sm font-medium text-red-500">Voided</p>
            <p className="text-sm text-red-500">{entry.voidReason}</p>
            <p className="text-xs text-red-500">Voided at: {new Date(entry.voidedAt).toLocaleString()}</p>
            {entry.reversalOfId && (
              <p className="text-xs text-red-500">
                Reversal of{' '}
                <Link href={`/accounting/journals/${entry.reversalOfId}`} className="underline hover:text-red-500">
                  original entry
                </Link>
              </p>
            )}
          </div>
        )}

        {entry.sourceReferenceId && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Source Reference</p>
            <p className="mt-1 text-sm text-muted-foreground">{entry.sourceReferenceId}</p>
          </div>
        )}
      </div>

      {/* Lines */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Journal Lines ({entry.lines.length})
        </h2>
        <JournalLinesTable lines={entry.lines} />
      </div>

      {/* Back link */}
      <Link
        href="/accounting/journals"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Journal Entries
      </Link>

      {/* Void Dialog */}
      {showVoidDialog && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowVoidDialog(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Void Journal Entry</h3>
            <p className="text-sm text-muted-foreground">
              This will create a reversal entry. This action cannot be undone.
            </p>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Void Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                placeholder="Enter the reason for voiding this entry..."
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowVoidDialog(false); setVoidReason(''); }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={!voidReason.trim() || isVoiding}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isVoiding ? 'Voiding...' : 'Void Entry'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </AccountingPageShell>
  );
}
