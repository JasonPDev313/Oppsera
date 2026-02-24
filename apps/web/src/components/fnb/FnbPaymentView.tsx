'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { useFnbTab } from '@/hooks/use-fnb-tab';
import { usePaymentSession, usePreAuth, useTipActions } from '@/hooks/use-fnb-payments';
import { apiFetch } from '@/lib/api-client';
import { PaymentScreen } from './payment/PaymentScreen';
import type { CheckSummary } from '@/types/fnb';
import type { TenderType } from './payment/TenderGrid';
import type { ReceiptAction } from './payment/ReceiptOptions';
import type { TenderResult } from './payment/PaymentScreen';
import { ArrowLeft, WifiOff } from 'lucide-react';

interface FnbPaymentViewProps {
  userId: string;
}

export function FnbPaymentView({ userId: _userId }: FnbPaymentViewProps) {
  const store = useFnbPosStore();
  const tabId = store.activeTabId;
  const { tab, isLoading: isLoadingTab, error: tabError } = useFnbTab({ tabId });
  const {
    sessions,
    startSession,
    completeSession,
    failSession,
    recordTender,
    voidLastTender,
  } = usePaymentSession({ tabId: tabId ?? '' });
  const { preauths, capturePreauth, voidPreauth } = usePreAuth({ tabId: tabId ?? undefined });
  const { adjustTip } = useTipActions();

  const [check, setCheck] = useState<CheckSummary | null>(null);
  const [isLoadingCheck, setIsLoadingCheck] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const isActingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  // ── Reusable check-fetch (fixes stale check bug — Phase 0A) ───
  const refreshCheck = useCallback(async () => {
    if (!tab?.primaryOrderId) return;
    try {
      const res = await apiFetch<{ data: CheckSummary }>(
        `/api/v1/fnb/tabs/${tab.id}/check?orderId=${tab.primaryOrderId}`,
      );
      setCheck(res.data);
      setCheckError(null);
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Failed to load check');
    }
  }, [tab?.id, tab?.primaryOrderId]);

  // Initial check fetch
  useEffect(() => {
    if (!tab?.primaryOrderId) return;
    setIsLoadingCheck(true);
    setCheckError(null);
    refreshCheck().finally(() => setIsLoadingCheck(false));
  }, [tab?.primaryOrderId, refreshCheck]);

  // ── Reuse existing session if one is active (Phase 0D) ────────
  useEffect(() => {
    const active = sessions.find(
      (s) => s.status === 'pending' || s.status === 'in_progress',
    );
    if (active) {
      sessionIdRef.current = active.id;
    }
  }, [sessions]);

  // ── Filter expired pre-auths (Phase 0C) ───────────────────────
  const activePreauths = preauths.filter((p) => {
    if (p.status !== 'authorized' && p.status !== 'created') return false;
    if (p.expiresAt && new Date(p.expiresAt) <= new Date()) return false;
    return true;
  });

  const handleBack = () => {
    store.navigateTo('tab');
  };

  // ── Main tender handler (Phase 0A + 0B + 0D fix) ─────────────
  const handleTender = useCallback(
    async (type: TenderType, amountCents: number, tipCents: number): Promise<TenderResult> => {
      if (!tab) return { isFullyPaid: false, remainingCents: 0 };

      // Phase 0D: prevent double-click race
      if (isActingRef.current) return { isFullyPaid: false, remainingCents: check?.remainingCents ?? 0 };
      isActingRef.current = true;

      // Phase 7B: offline guard
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        isActingRef.current = false;
        throw new Error('Cannot process payment while offline');
      }

      try {
        // Ensure payment session exists (reuse active or create new)
        let sessionId = sessionIdRef.current;
        if (!sessionId) {
          const session = await startSession({
            tabId: tab.id,
            orderId: tab.primaryOrderId,
            totalAmountCents: check?.totalCents ?? 0,
            clientRequestId: crypto.randomUUID(),
          });
          sessionId = session.id;
          sessionIdRef.current = sessionId;
        }

        // Record the tender — server response includes updated amounts
        const result = await recordTender({
          sessionId,
          tenderId: crypto.randomUUID(),
          amountCents,
          tenderType: type,
          clientRequestId: crypto.randomUUID(),
        });

        // Adjust tip if applicable
        if (tipCents > 0) {
          await adjustTip({
            tabId: tab.id,
            originalTipCents: 0,
            adjustedTipCents: tipCents,
            adjustmentReason: 'Customer tip',
          });
        }

        // Refresh check to get accurate paidCents/remainingCents from server
        await refreshCheck();

        // Use server response to determine if fully paid
        // Backend auto-completes session when remaining ≤ 0
        const tenderResult = result as Record<string, unknown>;
        const sessionStatus = (tenderResult?.sessionStatus as string) ?? '';
        const serverRemaining = (tenderResult?.remainingAmountCents as number) ?? 0;
        const isFullyPaid = sessionStatus === 'completed' || serverRemaining <= 0;

        // If fully paid but session wasn't auto-completed, complete it explicitly
        if (isFullyPaid && sessionStatus !== 'completed') {
          await completeSession(sessionId, {
            sessionId,
            clientRequestId: crypto.randomUUID(),
          });
        }

        if (isFullyPaid) {
          sessionIdRef.current = null;
        }

        return { isFullyPaid, remainingCents: Math.max(0, serverRemaining) };
      } finally {
        isActingRef.current = false;
      }
    },
    [tab, check, sessions, startSession, recordTender, adjustTip, completeSession, refreshCheck],
  );

  // ── Void last tender handler (Phase 1C) ───────────────────────
  const handleVoidLastTender = useCallback(async (): Promise<TenderResult> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !tab) return { isFullyPaid: false, remainingCents: check?.remainingCents ?? 0 };

    if (isActingRef.current) return { isFullyPaid: false, remainingCents: check?.remainingCents ?? 0 };
    isActingRef.current = true;

    try {
      const result = await voidLastTender(sessionId);
      await refreshCheck();
      const voidResult = result as Record<string, unknown>;
      const remaining = (voidResult?.remainingAmountCents as number) ?? check?.remainingCents ?? 0;
      return { isFullyPaid: false, remainingCents: remaining };
    } finally {
      isActingRef.current = false;
    }
  }, [tab, check, voidLastTender, refreshCheck]);

  const handleCapturePreAuth = useCallback(
    async (preauthId: string, captureAmountCents: number, tipCents: number) => {
      await capturePreauth(preauthId, {
        preauthId,
        captureAmountCents,
        tipAmountCents: tipCents,
      });
      await refreshCheck();
    },
    [capturePreauth, refreshCheck],
  );

  const handleVoidPreAuth = useCallback(
    async (preauthId: string) => {
      await voidPreauth(preauthId, { preauthId, reason: 'Voided by server' });
    },
    [voidPreauth],
  );

  const handleReceipt = useCallback((_action: ReceiptAction) => {
    // Receipt printing/emailing handled by print service (Phase 10)
  }, []);

  const handleClose = useCallback(() => {
    sessionIdRef.current = null;
    store.navigateTo('floor');
    store.setActiveTab(null);
  }, [store]);

  const handleFailSession = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      await failSession(sessionId, {
        sessionId,
        reason: 'Cancelled by user',
        clientRequestId: crypto.randomUUID(),
      });
      sessionIdRef.current = null;
    }
    store.navigateTo('tab');
  }, [failSession, store]);

  // ── Error state: tab failed to load ────────────────────────────
  if (tabError && !tab) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3"
        style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
      >
        <p className="text-sm font-medium" style={{ color: 'var(--fnb-danger)' }}>
          Failed to load tab
        </p>
        <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
          {tabError}
        </p>
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors hover:opacity-80"
          style={{
            backgroundColor: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-secondary)',
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tab
        </button>
      </div>
    );
  }

  // ── Loading state: tab or check still fetching ────────────────
  if (!tab || isLoadingTab || isLoadingCheck) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3"
        style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
      >
        <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
          Loading payment...
        </p>
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs transition-colors hover:opacity-80"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>
    );
  }

  // ── Error state: check failed to load ─────────────────────────
  if (!check) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3"
        style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
      >
        <p className="text-sm font-medium" style={{ color: checkError ? 'var(--fnb-danger)' : 'var(--fnb-text-muted)' }}>
          {checkError ?? 'No check available'}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tab
          </button>
          {checkError && (
            <button
              type="button"
              onClick={() => {
                setIsLoadingCheck(true);
                setCheckError(null);
                refreshCheck().finally(() => setIsLoadingCheck(false));
              }}
              className="rounded-lg px-4 py-2 text-sm font-bold transition-colors hover:opacity-80"
              style={{
                backgroundColor: 'var(--fnb-accent)',
                color: '#fff',
              }}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // Phase 7B: offline banner
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
    >
      {/* Offline banner */}
      {isOffline && (
        <div
          className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold shrink-0"
          style={{
            backgroundColor: 'var(--fnb-payment-error-bg)',
            color: 'var(--fnb-danger)',
          }}
        >
          <WifiOff className="h-3.5 w-3.5" />
          Offline — payments unavailable
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{
          backgroundColor: 'var(--fnb-bg-surface)',
          borderColor: 'rgba(148, 163, 184, 0.15)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center justify-center rounded-lg h-8 w-8 transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2
            className="text-base font-bold"
            style={{ color: 'var(--fnb-text-primary)' }}
          >
            Payment — Tab #{tab.tabNumber}
          </h2>
        </div>
      </div>

      {/* Payment content */}
      <div className="flex-1 overflow-hidden">
        <PaymentScreen
          tab={tab}
          check={check}
          preauths={activePreauths}
          onTender={handleTender}
          onVoidLastTender={handleVoidLastTender}
          onCapturePreAuth={handleCapturePreAuth}
          onVoidPreAuth={handleVoidPreAuth}
          onReceipt={handleReceipt}
          onClose={handleClose}
          onCancelPayment={handleFailSession}
          onCheckRefresh={refreshCheck}
          disabled={isOffline}
        />
      </div>
    </div>
  );
}
