'use client';

import { useState } from 'react';
import { useAuthContext } from '@/components/auth-provider';
import { useCloseBatch } from '@/hooks/use-fnb-close-batch';
import { ZReportView } from '@/components/fnb/close/ZReportView';
import { CashCountForm } from '@/components/fnb/close/CashCountForm';
import { OverShortDisplay } from '@/components/fnb/close/OverShortDisplay';
import { ServerCheckoutList } from '@/components/fnb/close/ServerCheckoutList';
import { ArrowLeft, FileText, Lock, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CloseBatchContent() {
  const { locations } = useAuthContext();
  const router = useRouter();
  const locationId = locations[0]?.id ?? '';
  const today = new Date().toISOString().slice(0, 10);

  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [cashCountCents, setCashCountCents] = useState<number | null>(null);

  const {
    batch,
    zReport,
    checkouts,
    isLoading,
    isActing,
    startBatch,
    lockBatch,
    postBatch,
    // reconcileBatch,
    recordCashCount,
  } = useCloseBatch({ closeBatchId: activeBatchId ?? undefined });

  const handleStartBatch = async () => {
    const result = await startBatch({
      locationId,
      businessDate: today,
      startingFloatCents: 20000, // $200 default float
    });
    if (result) setActiveBatchId(result.id);
  };

  const handleCashCount = async (totalCents: number, denominations: Record<string, number>) => {
    setCashCountCents(totalCents);
    await recordCashCount({
      closeBatchId: activeBatchId,
      denominations,
      totalCents,
    });
  };

  // Expected cash = cash tenders from Z-report minus starting float
  const expectedCashCents = zReport
    ? (zReport.tenderBreakdown['cash'] ?? 0) + 20000
    : 0;

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b shrink-0"
        style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/fnb-manager')}
            className="flex items-center justify-center rounded-lg h-8 w-8 transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" style={{ color: 'var(--fnb-status-check-presented)' }} />
            <h1 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              Close Batch — {today}
            </h1>
          </div>
        </div>

        {batch && (
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
              style={{
                backgroundColor: `color-mix(in srgb, var(--fnb-status-${batch.status === 'open' ? 'seated' : batch.status === 'locked' ? 'check-presented' : 'available'}) 15%, transparent)`,
                color: `var(--fnb-status-${batch.status === 'open' ? 'seated' : batch.status === 'locked' ? 'check-presented' : 'available'})`,
              }}
            >
              {batch.status}
            </span>
            {batch.status === 'open' && (
              <button
                type="button"
                onClick={lockBatch}
                disabled={isActing}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: 'var(--fnb-status-check-presented)', color: 'white' }}
              >
                <Lock className="h-3 w-3" /> Lock
              </button>
            )}
            {batch.status === 'locked' && (
              <button
                type="button"
                onClick={postBatch}
                disabled={isActing}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: 'var(--fnb-status-available)' }}
              >
                <Send className="h-3 w-3" /> Post to GL
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!activeBatchId ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <FileText className="h-12 w-12" style={{ color: 'var(--fnb-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>No active close batch</p>
            <button
              type="button"
              onClick={handleStartBatch}
              disabled={isActing}
              className="rounded-lg px-6 py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: 'var(--fnb-status-seated)' }}
            >
              Start Close Batch
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: 'var(--fnb-text-muted)' }} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Left column */}
            <div className="space-y-4">
              {zReport && <ZReportView data={zReport} />}
              <ServerCheckoutList checkouts={checkouts} />
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <CashCountForm onSubmit={handleCashCount} disabled={isActing} />
              {cashCountCents !== null && (
                <OverShortDisplay
                  expectedCents={expectedCashCents}
                  actualCents={cashCountCents}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
