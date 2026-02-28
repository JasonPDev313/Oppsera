'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, BookOpen, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useGLDetail } from '@/hooks/use-journals';
import { formatAccountingMoney } from '@/types/accounting';

// ── Types ──────────────────────────────────────────────────────

export interface DrillDownDrawerProps {
  accountId: string | null;
  accountName: string;
  from?: string;
  to?: string;
  locationId?: string;
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────

export function DrillDownDrawer({
  accountId,
  accountName,
  from,
  to,
  locationId,
  onClose,
}: DrillDownDrawerProps) {
  const router = useRouter();
  const drawerRef = useRef<HTMLDivElement>(null);

  const { data: lines, meta, isLoading } = useGLDetail({
    accountId,
    startDate: from,
    endDate: to,
    locationId,
  });

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Trap focus inside drawer
  useEffect(() => {
    if (drawerRef.current) {
      drawerRef.current.focus();
    }
  }, []);

  const handleJournalClick = useCallback(
    (journalId: string) => {
      router.push(`/accounting/gl?journalId=${journalId}`);
      onClose();
    },
    [router, onClose],
  );

  if (!accountId) return null;

  const content = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`GL detail for ${accountName}`}
        tabIndex={-1}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[560px] flex-col border-l border-border bg-surface shadow-xl outline-none animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-foreground">
              {accountName}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {from && to
                ? `${from} — ${to}`
                : to
                  ? `As of ${to}`
                  : 'All periods'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Balance summary */}
        {!isLoading && lines.length > 0 && (
          <div className="flex items-center gap-4 border-b border-border px-5 py-3">
            <div>
              <span className="text-xs text-muted-foreground">Opening</span>
              <div className="text-sm font-semibold tabular-nums text-foreground">
                {formatAccountingMoney(meta.openingBalance)}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-xs text-muted-foreground">Closing</span>
              <div className="text-sm font-semibold tabular-nums text-foreground">
                {formatAccountingMoney(meta.closingBalance)}
              </div>
            </div>
            <div className="flex-1" />
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {lines.length} entries
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading journal lines...</span>
            </div>
          )}

          {!isLoading && lines.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
              <BookOpen className="h-8 w-8" />
              <p className="text-sm">No journal entries for this account in the selected period.</p>
            </div>
          )}

          {!isLoading && lines.length > 0 && (
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Journal #</th>
                  <th className="px-4 py-2.5 text-left">Description</th>
                  <th className="px-4 py-2.5 text-right">Debit</th>
                  <th className="px-4 py-2.5 text-right">Credit</th>
                  <th className="px-4 py-2.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr
                    key={`${line.journalId}-${idx}`}
                    className="border-b border-border/50 last:border-border hover:bg-accent/30"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                      {line.date}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => handleJournalClick(line.journalId)}
                        className="text-sm font-mono text-indigo-500 hover:underline"
                      >
                        #{line.journalNumber}
                      </button>
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-2 text-sm text-foreground" title={line.memo ?? ''}>
                      {line.memo || line.sourceModule}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm tabular-nums text-foreground">
                      {line.debit > 0 ? formatAccountingMoney(line.debit) : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm tabular-nums text-foreground">
                      {line.credit > 0 ? formatAccountingMoney(line.credit) : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm tabular-nums font-medium text-foreground">
                      {formatAccountingMoney(line.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}

// ── Clickable Amount Wrapper ─────────────────────────────────

export function DrillDownAmount({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`cursor-pointer hover:underline hover:text-indigo-500 transition-colors ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
