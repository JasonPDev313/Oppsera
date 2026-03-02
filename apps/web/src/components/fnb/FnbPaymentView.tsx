'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { useFnbTab } from '@/hooks/use-fnb-tab';
import { usePaymentSession, usePreAuth, useTipActions } from '@/hooks/use-fnb-payments';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { printReceiptDocument } from '@/lib/receipt-printer';
import { buildReceiptDocument, fnbTabToInput } from '@oppsera/shared';
import type { FnbTabForReceipt } from '@oppsera/shared';
import { PaymentScreen } from './payment/PaymentScreen';
import type { CheckSummary } from '@/types/fnb';
import type { FnbTabDetail } from '@/types/fnb';
import type { TenderType } from './payment/TenderGrid';
import type { ReceiptAction } from './payment/ReceiptOptions';
import type { TenderResult } from './payment/PaymentScreen';
import { useTokenizerConfig } from '@/hooks/use-tokenizer-config';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { ManageTabsButton } from './manage-tabs/ManageTabsButton';

interface FnbPaymentViewProps {
  userId: string;
}

/** Map F&B tab + check data to FnbTabForReceipt for the receipt engine */
function mapTabForReceipt(tab: FnbTabDetail, check: CheckSummary): FnbTabForReceipt {
  return {
    id: tab.id,
    tabNumber: String(tab.tabNumber),
    tableNumber: tab.tableNumber != null ? String(tab.tableNumber) : null,
    serverName: tab.serverName ?? null,
    guestCount: tab.partySize ?? null,
    createdAt: tab.openedAt,
    lines: tab.lines.filter((l) => l.status !== 'voided').map((line) => ({
      id: line.id,
      name: line.catalogItemName ?? 'Item',
      qty: line.qty,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.extendedPriceCents,
      seatNumber: line.seatNumber ?? null,
      modifiers: (line.modifiers as Array<{ name: string; priceCents: number }>) ?? [],
      specialInstructions: line.specialInstructions ?? null,
      isVoided: false,
      isComped: false,
    })),
    subtotalCents: check.subtotalCents,
    discountCents: check.discountTotalCents,
    serviceChargeCents: check.serviceChargeTotalCents,
    taxCents: check.taxTotalCents,
    totalCents: check.totalCents,
  };
}

export function FnbPaymentView({ userId: _userId }: FnbPaymentViewProps) {
  const store = useFnbPosStore();
  const { locations } = useAuthContext();
  const locationId = locations?.[0]?.id;
  const tabId = store.activeTabId;
  const { tab, isLoading: isLoadingTab, error: tabError, notFound: tabNotFound, refresh: refreshTab } = useFnbTab({ tabId });
  const {
    sessions,
    startSession,
    completeSession,
    failSession,
    recordTender,
    voidLastTender,
  } = usePaymentSession({ tabId: tabId ?? '', locationId });
  const { preauths, capturePreauth, voidPreauth } = usePreAuth({ tabId: tabId ?? undefined });
  const { adjustTip } = useTipActions();
  const { config: tokenizerConfig, isLoading: tokenizerLoading, error: tokenizerError } = useTokenizerConfig({
    enabled: !!tabId,
  });

  const [check, setCheck] = useState<CheckSummary | null>(null);
  const [isLoadingCheck, setIsLoadingCheck] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const isActingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  // Tracks orderId returned by prepare-check before the tab hook refreshes
  const preparedOrderIdRef = useRef<string | null>(null);
  const prepareCalledRef = useRef<string | null>(null); // tracks tabId to prevent double-call

  // ── Auto-navigate back when tab was closed/voided by another terminal ──
  useEffect(() => {
    if (tabNotFound) {
      store.setActiveTab(null);
      store.navigateTo('floor');
    }
  }, [tabNotFound, store]);

  // ── Reusable check-fetch (uses tab.primaryOrderId or prepared fallback) ──
  const refreshCheck = useCallback(async () => {
    const orderId = tab?.primaryOrderId ?? preparedOrderIdRef.current;
    if (!tab?.id || !orderId) return;
    try {
      const res = await apiFetch<{ data: CheckSummary }>(
        `/api/v1/fnb/tabs/${tab.id}/check?orderId=${orderId}`,
      );
      setCheck(res.data);
      setCheckError(null);
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Failed to load check');
    }
  }, [tab?.id, tab?.primaryOrderId]);

  // ── Auto-prepare check: create order from tab items if needed ──
  const prepareAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!tab || tab.primaryOrderId || isPreparing) return;
    // Only call once per tabId — NOT reset on error (Retry button resets manually)
    if (prepareCalledRef.current === tab.id) return;
    const activeLines = tab.lines.filter((l) => l.status !== 'voided');
    if (activeLines.length === 0) return;
    if (!locationId) {
      setCheckError('No location selected — cannot prepare check');
      return;
    }

    prepareCalledRef.current = tab.id;
    setIsPreparing(true);
    setIsLoadingCheck(true);
    setCheckError(null);

    // Cancel any prior in-flight request
    prepareAbortRef.current?.abort();
    const ac = new AbortController();
    prepareAbortRef.current = ac;

    apiFetch<{ data: { orderId: string; check: CheckSummary } }>(
      `/api/v1/fnb/tabs/${tab.id}/prepare-check`,
      { method: 'POST', signal: ac.signal, headers: locationId ? { 'X-Location-Id': locationId } : undefined },
    )
      .then((res) => {
        preparedOrderIdRef.current = res.data.orderId;
        setCheck(res.data.check);
        setCheckError(null);
        // Refresh tab to pick up the server-set primaryOrderId
        refreshTab();
      })
      .catch((e) => {
        // Ignore aborted requests (user navigated away)
        if (e instanceof DOMException && e.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : 'Failed to prepare check';
        console.error('[FnbPayment] prepare-check failed:', msg, e);
        setCheckError(msg);
        // Do NOT reset prepareCalledRef here — that causes an infinite retry loop.
        // The Retry button resets it manually.
      })
      .finally(() => {
        setIsPreparing(false);
        setIsLoadingCheck(false);
      });

    return () => { ac.abort(); };
  }, [tab, isPreparing, refreshTab]);

  // Initial check fetch (only when primaryOrderId already exists)
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
          const effectiveOrderId = tab.primaryOrderId ?? preparedOrderIdRef.current;
          const session = await startSession({
            tabId: tab.id,
            orderId: effectiveOrderId,
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

        // Adjust tip — must await to prevent Vercel fire-and-forget zombie connections
        if (tipCents > 0) {
          try {
            await adjustTip({
              tabId: tab.id,
              originalTipCents: 0,
              adjustedTipCents: tipCents,
              adjustmentReason: 'Customer tip',
            });
          } catch (err) {
            console.error('[fnb-tip] adjustTip failed:', err);
          }
        }

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
    [tab, check, sessions, startSession, recordTender, adjustTip, completeSession],
  );

  // ── Void last tender handler (Phase 1C) ───────────────────────
  const handleVoidLastTender = useCallback(async (): Promise<TenderResult> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !tab) return { isFullyPaid: false, remainingCents: check?.remainingCents ?? 0 };

    if (isActingRef.current) return { isFullyPaid: false, remainingCents: check?.remainingCents ?? 0 };
    isActingRef.current = true;

    try {
      const result = await voidLastTender(sessionId);
      const voidResult = result as Record<string, unknown>;
      const remaining = (voidResult?.remainingAmountCents as number) ?? check?.remainingCents ?? 0;
      return { isFullyPaid: false, remainingCents: remaining };
    } finally {
      isActingRef.current = false;
    }
  }, [tab, check, voidLastTender]);

  const handleCapturePreAuth = useCallback(
    async (preauthId: string, captureAmountCents: number, tipCents: number) => {
      await capturePreauth(preauthId, {
        preauthId,
        captureAmountCents,
        tipAmountCents: tipCents,
      });
    },
    [capturePreauth],
  );

  const handleVoidPreAuth = useCallback(
    async (preauthId: string) => {
      await voidPreauth(preauthId, { preauthId, reason: 'Voided by server' });
    },
    [voidPreauth],
  );

  const handleReceipt = useCallback(
    (action: ReceiptAction, email?: string) => {
      if (action === 'print' && tab && check) {
        const locationName = locations[0]?.name ?? 'Restaurant';
        const mapped = mapTabForReceipt(tab, check);
        const input = fnbTabToInput(mapped, locationName);
        const doc = buildReceiptDocument(input);
        // Fire-and-forget — never block POS on print
        printReceiptDocument(doc).catch(() => {});
      }
      if (action === 'email' && tab?.id && email) {
        // Fire-and-forget — email receipt via API
        apiFetch('/api/v1/receipts/email', {
          method: 'POST',
          body: JSON.stringify({ orderId: tab.id, email, variant: 'standard' }),
        }).catch(() => {});
      }
    },
    [tab, check, locations],
  );

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
  if (!tab || isLoadingTab || isLoadingCheck || isPreparing) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3"
        style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
      >
        <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
          {isPreparing ? 'Preparing check...' : 'Loading payment...'}
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
    const hasNoItems = tab && tab.lines.filter((l) => l.status !== 'voided').length === 0;

    // If tab has items but check isn't ready yet and no error occurred,
    // we're in the brief gap between tab loading and prepare-check/fetch
    // firing — show loading instead of the error screen.
    if (!hasNoItems && !checkError) {
      return (
        <div
          className="flex h-full flex-col items-center justify-center gap-3"
          style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
        >
          <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
            Preparing check...
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

    const errorMessage = checkError
      ? checkError
      : hasNoItems
        ? 'No items on this tab — add items before paying'
        : 'No check available';

    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3"
        style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
      >
        <p className="text-sm font-medium" style={{ color: checkError ? 'var(--fnb-danger)' : 'var(--fnb-text-muted)' }}>
          {errorMessage}
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
          {!hasNoItems && (
            <button
              type="button"
              onClick={() => {
                setIsLoadingCheck(true);
                setCheckError(null);
                prepareCalledRef.current = null;
                refreshTab();
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
        <ManageTabsButton locationId={locationId ?? ''} />
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
          skipConfirm
          tokenizerConfig={tokenizerConfig}
          tokenizerLoading={tokenizerLoading}
          tokenizerError={tokenizerError}
        />
      </div>
    </div>
  );
}
