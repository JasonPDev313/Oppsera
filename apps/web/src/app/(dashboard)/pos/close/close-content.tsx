'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Check,
  Lock,
  FileText,
  ArrowLeft,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { usePOSConfig } from '@/hooks/use-pos-config';
import { useShift } from '@/hooks/use-shift';
import { useRetailClose } from '@/hooks/use-retail-close';
import { useToast } from '@/components/ui/toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import type { RetailCloseBatch, TenderBreakdownEntry, DepartmentSalesEntry } from '@oppsera/core/retail-close';

// ── Denomination counting (reused from CloseShiftDialog) ─────
const DENOMINATIONS = [
  { label: '$100', value: 10000 },
  { label: '$50', value: 5000 },
  { label: '$20', value: 2000 },
  { label: '$10', value: 1000 },
  { label: '$5', value: 500 },
  { label: '$1', value: 100 },
  { label: '25¢', value: 25 },
  { label: '10¢', value: 10 },
  { label: '5¢', value: 5 },
  { label: '1¢', value: 1 },
] as const;

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Status Stepper ───────────────────────────────────────────
const STEPS = [
  { key: 'in_progress', label: 'Started' },
  { key: 'reconciled', label: 'Reconciled' },
  { key: 'posted', label: 'Posted' },
  { key: 'locked', label: 'Locked' },
] as const;

function StatusStepper({ status }: { status: string }) {
  const stepIndex = STEPS.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, i) => {
        const isComplete = i <= stepIndex;
        const isCurrent = i === stepIndex;
        return (
          <div key={step.key} className="flex items-center gap-1">
            {i > 0 && (
              <div className={`h-0.5 w-6 ${isComplete ? 'bg-green-500' : 'bg-muted'}`} />
            )}
            <div
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                isComplete
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-muted text-muted-foreground'
              } ${isCurrent ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}
            >
              {isComplete && <Check className="h-3 w-3" />}
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Z-Report Component ───────────────────────────────────────
function ZReport({ batch }: { batch: RetailCloseBatch }) {
  const tenderBreakdown = (batch.tenderBreakdown ?? []) as TenderBreakdownEntry[];
  const salesByDept = (batch.salesByDepartment ?? []) as DepartmentSalesEntry[];

  return (
    <div className="space-y-4 print:text-sm">
      <div className="text-center font-mono">
        <div className="text-lg font-bold">Z-REPORT</div>
        <div className="text-sm text-muted-foreground">{batch.businessDate}</div>
      </div>

      {/* Sales Summary */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Sales Summary</h3>
        <div className="grid grid-cols-2 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Orders</span>
          <span className="text-right font-medium">{batch.orderCount}</span>
          <span className="text-muted-foreground">Gross Sales</span>
          <span className="text-right font-medium">{formatMoney(batch.grossSalesCents)}</span>
          <span className="text-muted-foreground">Discounts</span>
          <span className="text-right font-medium text-red-500">-{formatMoney(batch.discountTotalCents)}</span>
          <span className="text-muted-foreground font-semibold">Net Sales</span>
          <span className="text-right font-bold">{formatMoney(batch.netSalesCents)}</span>
          <div className="col-span-2 border-t border-border my-1" />
          <span className="text-muted-foreground">Tax Collected</span>
          <span className="text-right font-medium">{formatMoney(batch.taxCollectedCents)}</span>
          <span className="text-muted-foreground">Service Charges</span>
          <span className="text-right font-medium">{formatMoney(batch.serviceChargeCents)}</span>
          <span className="text-muted-foreground">Tips (Credit)</span>
          <span className="text-right font-medium">{formatMoney(batch.tipsCreditCents)}</span>
          <span className="text-muted-foreground">Tips (Cash)</span>
          <span className="text-right font-medium">{formatMoney(batch.tipsCashCents)}</span>
          {batch.voidCount > 0 && (
            <>
              <div className="col-span-2 border-t border-border my-1" />
              <span className="text-muted-foreground">Voids</span>
              <span className="text-right font-medium text-red-500">
                {batch.voidCount} ({formatMoney(batch.voidTotalCents)})
              </span>
            </>
          )}
        </div>
      </div>

      {/* Tender Breakdown */}
      {tenderBreakdown.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Tender Breakdown</h3>
          <div className="space-y-1.5">
            {tenderBreakdown.map((t) => (
              <div key={t.tenderType} className="flex justify-between text-sm">
                <span className="capitalize">{t.tenderType} ({t.count})</span>
                <span className="font-medium">{formatMoney(t.totalCents)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales by Department */}
      {salesByDept.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Sales by Department</h3>
          <div className="space-y-1.5">
            {salesByDept.map((d) => (
              <div key={d.departmentName} className="flex justify-between text-sm">
                <span>{d.departmentName} ({d.count})</span>
                <span className="font-medium">{formatMoney(d.totalCents)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cash Accountability */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Cash Accountability</h3>
        <div className="grid grid-cols-2 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Expected Cash</span>
          <span className="text-right font-medium">{formatMoney(batch.cashExpectedCents)}</span>
          <span className="text-muted-foreground">Counted Cash</span>
          <span className="text-right font-medium">
            {batch.cashCountedCents != null ? formatMoney(batch.cashCountedCents) : '—'}
          </span>
          {batch.cashOverShortCents != null && (
            <>
              <span className="text-muted-foreground font-semibold">Over / Short</span>
              <span
                className={`text-right font-bold ${
                  batch.cashOverShortCents === 0
                    ? 'text-green-500'
                    : batch.cashOverShortCents > 0
                      ? 'text-blue-500'
                      : 'text-red-500'
                }`}
              >
                {batch.cashOverShortCents === 0
                  ? 'Balanced'
                  : formatMoney(batch.cashOverShortCents)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* GL Reference */}
      {batch.glJournalEntryId && (
        <div className="text-center text-xs text-muted-foreground">
          GL Journal: {batch.glJournalEntryId}
        </div>
      )}
    </div>
  );
}

// ── Cash Count Form ──────────────────────────────────────────
function CashCountForm({
  expectedCents,
  onSubmit,
  isSubmitting,
}: {
  expectedCents: number;
  onSubmit: (countedCents: number, notes?: string) => void;
  isSubmitting: boolean;
}) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [showDenominations, setShowDenominations] = useState(false);
  const [notes, setNotes] = useState('');

  const totalCents = DENOMINATIONS.reduce((sum, d) => {
    return sum + (counts[d.value] ?? 0) * d.value;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/50 p-3 text-center">
        <div className="text-sm text-muted-foreground">Expected Cash in Drawer</div>
        <div className="text-lg font-semibold">{formatMoney(expectedCents)}</div>
      </div>

      <button
        type="button"
        onClick={() => setShowDenominations(!showDenominations)}
        className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
      >
        <span>Count by Denomination</span>
        {showDenominations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {showDenominations && (
        <div className="space-y-2">
          {DENOMINATIONS.map((d) => (
            <div key={d.value} className="flex items-center justify-between">
              <span className="w-16 text-sm font-medium">{d.label}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCounts((p) => ({ ...p, [d.value]: Math.max(0, (p[d.value] ?? 0) - 1) }))
                  }
                  className="h-8 w-8 rounded-lg border border-border text-sm font-bold transition-colors hover:bg-accent"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm font-medium">
                  {counts[d.value] ?? 0}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCounts((p) => ({ ...p, [d.value]: (p[d.value] ?? 0) + 1 }))
                  }
                  className="h-8 w-8 rounded-lg border border-border text-sm font-bold transition-colors hover:bg-accent"
                >
                  +
                </button>
                <span className="w-20 text-right text-sm text-muted-foreground">
                  {formatMoney((counts[d.value] ?? 0) * d.value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg bg-indigo-500/10 p-3 text-center">
        <div className="text-sm text-indigo-600">Counted Cash</div>
        <div className="text-2xl font-bold text-indigo-500">{formatMoney(totalCents)}</div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about this close..."
          rows={2}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none bg-surface"
        />
      </div>

      <button
        type="button"
        onClick={() => onSubmit(totalCents, notes || undefined)}
        disabled={isSubmitting}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
      >
        {isSubmitting ? 'Reconciling...' : 'Submit Cash Count'}
      </button>
    </div>
  );
}

// ── Main Close Content ───────────────────────────────────────
export default function CloseContent() {
  const router = useRouter();
  const { locations } = useAuthContext();
  const { toast } = useToast();
  const locationId = locations[0]?.id ?? '';
  const { config } = usePOSConfig(locationId, 'retail');
  const terminalId = config?.terminalId ?? '';
  const shift = useShift(locationId, terminalId);
  const close = useRetailClose();

  const [initialized, setInitialized] = useState(false);

  // On mount: check for existing batch or start one
  useEffect(() => {
    if (initialized || !terminalId) return;
    setInitialized(true);

    const today = new Date().toISOString().slice(0, 10);
    close.fetchByTerminalDate(terminalId, today);
  }, [terminalId, initialized, close]);

  const handleStartClose = useCallback(async () => {
    if (!terminalId || !locationId) return;

    // Check if drawer session is still open
    if (shift.isOpen) {
      toast.error('Please close the shift before starting the end-of-day close');
      return;
    }

    await close.startClose({
      terminalId,
      locationId,
      drawerSessionId: shift.currentShift?.id ?? undefined,
    });
  }, [terminalId, locationId, shift, close, toast]);

  const handleReconcile = useCallback(
    async (countedCents: number, notes?: string) => {
      await close.reconcile(countedCents, notes);
    },
    [close],
  );

  const handlePost = useCallback(async () => {
    await close.postToGL();
  }, [close]);

  const handleLock = useCallback(async () => {
    await close.lock();
  }, [close]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (close.isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg p-1.5 transition-colors hover:bg-accent/50"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">End-of-Day Close</h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        {close.batch && (
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent print:hidden"
          >
            <FileText className="h-3.5 w-3.5" />
            Print Z-Report
          </button>
        )}
      </div>

      {/* Status stepper */}
      {close.batch && (
        <div className="mb-6 print:hidden">
          <StatusStepper status={close.batch.status} />
        </div>
      )}

      {/* No batch yet — start one */}
      {!close.batch && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">No Close Batch for Today</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start the end-of-day close to generate the Z-report and reconcile cash.
          </p>
          {shift.isOpen && (
            <p className="mt-2 text-sm text-amber-500 font-medium">
              Note: Close the shift first before starting the EOD close.
            </p>
          )}
          <button
            type="button"
            onClick={handleStartClose}
            disabled={close.isActing || shift.isOpen}
            className="mt-4 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {close.isActing ? 'Starting...' : 'Start Close'}
          </button>
        </div>
      )}

      {/* Batch started — show Z-report */}
      {close.batch && (
        <div className="space-y-6">
          {/* Z-Report */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <ZReport batch={close.batch} />
          </div>

          {/* Cash Count (only for in_progress status) */}
          {close.batch.status === 'in_progress' && (
            <div className="rounded-2xl border border-border bg-surface p-6 print:hidden">
              <h2 className="mb-4 text-lg font-semibold">Cash Count</h2>
              <CashCountForm
                expectedCents={close.batch.cashExpectedCents}
                onSubmit={handleReconcile}
                isSubmitting={close.isActing}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 print:hidden">
            {close.batch.status === 'reconciled' && (
              <button
                type="button"
                onClick={handlePost}
                disabled={close.isActing}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {close.isActing ? 'Posting...' : 'Post to GL'}
              </button>
            )}

            {close.batch.status === 'posted' && (
              <button
                type="button"
                onClick={handleLock}
                disabled={close.isActing}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-900 disabled:opacity-50"
              >
                <Lock className="h-4 w-4" />
                {close.isActing ? 'Locking...' : 'Lock Batch'}
              </button>
            )}

            {close.batch.status === 'locked' && (
              <div className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500/10 px-4 py-2.5 text-sm font-medium text-green-500">
                <Lock className="h-4 w-4" />
                Batch Locked — Close Complete
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
