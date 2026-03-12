'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import type { HouseAccountMeta } from './payment/PaymentScreen';
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

/** Build an optimistic CheckSummary from tab line data (instant, no server round-trip) */
function computeOptimisticCheck(tab: FnbTabDetail): CheckSummary {
  const activeLines = tab.lines.filter((l) => l.status !== 'voided');
  const subtotalCents = activeLines.reduce((sum, l) => sum + l.extendedPriceCents, 0);
  const taxCents = tab.taxTotalCents ?? 0;
  const totalCents = subtotalCents + taxCents;
  return {
    orderId: '',
    subtotalCents,
    taxTotalCents: taxCents,
    serviceChargeTotalCents: 0,
    discountTotalCents: 0,
    totalCents,
    paidCents: 0,
    remainingCents: totalCents,
    tenderCount: 0,
    status: 'open',
  };
}

export function FnbPaymentView({ userId: _userId }: FnbPaymentViewProps) {
  const store = useFnbPosStore();
  const { locations } = useAuthContext();
  const locationId = locations?.[0]?.id;
  const tabId = store.activeTabId;
  const { tab, error: tabError, notFound: tabNotFound, refresh: refreshTab } = useFnbTab({ tabId });
  const {
    sessions,
    startSession,
    completeSession,
    failSession,
    recordTender,
    voidLastTender,
    quickCashPayment,
    payTabUnified,
    processCardPayment,
  } = usePaymentSession({ tabId: tabId ?? '', locationId });
  const { preauths, capturePreauth, voidPreauth } = usePreAuth({ tabId: tabId ?? undefined });
  const { adjustTip } = useTipActions();
  const { config: tokenizerConfig, isLoading: tokenizerLoading, error: tokenizerError } = useTokenizerConfig({
    enabled: !!tabId,
  });

  const [check, setCheck] = useState<CheckSummary | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Optimistic check: show tab-derived totals instantly, replace with server data when ready
  const displayCheck: CheckSummary | null = check ?? (
    tab && tab.lines.some((l) => l.status !== 'voided')
      ? computeOptimisticCheck(tab)
      : null
  );
  const isActingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  // Tracks orderId returned by prepare-check before the tab hook refreshes
  const preparedOrderIdRef = useRef<string | null>(null);
  const prepareCalledRef = useRef<string | null>(null); // tracks tabId to prevent double-call
  const preparePromiseRef = useRef<Promise<{ orderId: string; check: CheckSummary } | null> | null>(null);

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

  // Derive stable scalars from tab so the effect doesn't re-run (and abort its
  // own in-flight request) every time the tab object reference changes on re-fetch.
  const stableTabId = tab?.id;
  const stableHasPrimaryOrder = !!tab?.primaryOrderId;
  const stableHasActiveLines = tab?.lines?.some((l) => l.status !== 'voided') ?? false;

  useEffect(() => {
    if (!stableTabId || stableHasPrimaryOrder) return;
    // Only call once per tabId — NOT reset on error (Retry button resets manually)
    if (prepareCalledRef.current === stableTabId) return;
    if (!stableHasActiveLines) return;
    if (!locationId) {
      setCheckError('No location selected — cannot prepare check');
      return;
    }

    prepareCalledRef.current = stableTabId;
    setCheckError(null);

    // Cancel any prior in-flight request
    prepareAbortRef.current?.abort();
    const ac = new AbortController();
    prepareAbortRef.current = ac;

    // Retry helper — transient failures (network, pool pressure, 5xx) get up to
    // 2 automatic retries with exponential backoff before surfacing to the user.
    const MAX_RETRIES = 2;
    const attempt = async (retry = 0): Promise<{ orderId: string; check: CheckSummary } | null> => {
      try {
        const res = await apiFetch<{ data: { orderId: string; check: CheckSummary } }>(
          `/api/v1/fnb/tabs/${stableTabId}/prepare-check`,
          { method: 'POST', signal: ac.signal, headers: locationId ? { 'X-Location-Id': locationId } : undefined },
        );
        preparedOrderIdRef.current = res.data.orderId;
        setCheck(res.data.check);
        setCheckError(null);
        refreshTab();
        return res.data;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return null;
        // Don't retry 4xx (client errors) — only transient/server failures
        const is4xx = e instanceof Error && 'status' in e && (e as { status: number }).status >= 400 && (e as { status: number }).status < 500;
        if (!is4xx && retry < MAX_RETRIES && !ac.signal.aborted) {
          const delay = 1000 * 2 ** retry; // 1s, 2s
          console.warn(`[FnbPayment] prepare-check retry ${retry + 1}/${MAX_RETRIES} in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          if (ac.signal.aborted) return null;
          return attempt(retry + 1);
        }
        const msg = e instanceof Error ? e.message : 'Failed to prepare check';
        console.error('[FnbPayment] prepare-check failed:', msg, e);
        setCheckError(msg);
        return null;
      }
    };
    const promise = attempt();
    preparePromiseRef.current = promise;

    return () => { ac.abort(); };
  }, [stableTabId, stableHasPrimaryOrder, stableHasActiveLines, locationId, refreshTab]);

  // Initial check fetch (only when primaryOrderId already exists)
  useEffect(() => {
    if (!tab?.primaryOrderId) return;
    setCheckError(null);
    refreshCheck();
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
    async (type: TenderType, amountCents: number, tipCents: number, cardToken?: string | null, houseAccountMeta?: HouseAccountMeta): Promise<TenderResult> => {
      if (!tab) return { isFullyPaid: false, remainingCents: 0 };

      // Phase 0D: prevent double-click race
      if (isActingRef.current) return { isFullyPaid: false, remainingCents: displayCheck?.remainingCents ?? 0 };
      isActingRef.current = true;

      // Phase 7B: offline guard
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        isActingRef.current = false;
        throw new Error('Cannot process payment while offline');
      }

      try {
        // Wait for prepare-check if order hasn't been created yet
        if (!tab.primaryOrderId && !preparedOrderIdRef.current && preparePromiseRef.current) {
          await preparePromiseRef.current;
        }
        if (!tab.primaryOrderId && !preparedOrderIdRef.current) {
          const diagnostics = {
            tabId: tab.id,
            hasPreparePromise: !!preparePromiseRef.current,
            checkError,
          };
          console.error('[FnbPayment] handleTender: order not prepared', diagnostics);
          throw new Error(
            checkError
              ? `Order could not be prepared: ${checkError}`
              : 'Order could not be prepared — please go back and try again',
          );
        }

        // ── Unified single-trip payment for ALL tender types ──
        // One HTTP call: start session + record tender + auto-complete if fully paid
        const effectiveOrderId = tab.primaryOrderId ?? preparedOrderIdRef.current;
        const totalCents = displayCheck?.totalCents ?? 0;

        const result = await payTabUnified({
          tabId: tab.id,
          orderId: effectiveOrderId!,
          amountCents,
          totalAmountCents: totalCents,
          tenderType: type,
          sessionId: sessionIdRef.current ?? undefined,
          tipCents: tipCents > 0 ? tipCents : 0,
          changeCents: type === 'cash' && amountCents > totalCents ? amountCents - totalCents : 0,
          clientRequestId: crypto.randomUUID(),
          // Card-specific (gateway processes pre-transaction in the API route)
          ...(type === 'card' && cardToken ? { token: cardToken } : {}),
          // House account CMAA metadata (validated pre-transaction in the API route)
          ...(houseAccountMeta && {
            billingAccountId: houseAccountMeta.billingAccountId,
            customerId: houseAccountMeta.customerId,
            signatureData: houseAccountMeta.signatureData,
          }),
        });

        const resData = result as Record<string, unknown>;
        const sessionId = resData.sessionId as string;
        const isFullyPaid = resData.isFullyPaid as boolean;
        const serverRemaining = (resData.remainingAmountCents as number) ?? 0;

        // Track session for potential split payment follow-ups
        sessionIdRef.current = isFullyPaid ? null : sessionId;

        // Adjust tip for non-card tenders (card tips are in the gateway charge)
        // This is a separate call but only fires when needed, and the main payment
        // is already committed — tip failure won't block the payment UI
        const tipHandledByGateway = type === 'card' && !!cardToken;
        if (tipCents > 0 && !tipHandledByGateway) {
          try {
            await adjustTip({
              tabId: tab.id,
              tenderId: resData.tenderId as string,
              originalTipCents: 0,
              adjustedTipCents: tipCents,
              adjustmentReason: 'Customer tip',
            });
          } catch (err) {
            console.error('[fnb-tip] adjustTip failed:', err);
          }
        }

        return { isFullyPaid, remainingCents: Math.max(0, serverRemaining) };
      } finally {
        isActingRef.current = false;
      }
    },
    [tab, displayCheck, payTabUnified, adjustTip],
  );

  // ── Void last tender handler (Phase 1C) ───────────────────────
  const handleVoidLastTender = useCallback(async (): Promise<TenderResult> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !tab) return { isFullyPaid: false, remainingCents: displayCheck?.remainingCents ?? 0 };

    if (isActingRef.current) return { isFullyPaid: false, remainingCents: displayCheck?.remainingCents ?? 0 };
    isActingRef.current = true;

    try {
      const result = await voidLastTender(sessionId);
      const voidResult = result as Record<string, unknown>;
      const remaining = (voidResult?.remainingAmountCents as number) ?? displayCheck?.remainingCents ?? 0;
      return { isFullyPaid: false, remainingCents: remaining };
    } finally {
      isActingRef.current = false;
    }
  }, [tab, displayCheck, voidLastTender]);

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
      if (action === 'print' && tab && displayCheck) {
        const locationName = locations[0]?.name ?? 'Restaurant';
        const mapped = mapTabForReceipt(tab, displayCheck);
        const input = fnbTabToInput(mapped, locationName);
        const doc = buildReceiptDocument(input);
        // Fire-and-forget — never block POS on print
        printReceiptDocument(doc).catch(() => {});
      }
      const receiptOrderId = tab?.primaryOrderId ?? preparedOrderIdRef.current;
      if (action === 'email' && receiptOrderId && email) {
        // Fire-and-forget — email receipt via API
        apiFetch('/api/v1/receipts/email', {
          method: 'POST',
          body: JSON.stringify({ orderId: receiptOrderId, email, variant: 'standard' }),
        }).catch(() => {});
      }
    },
    [tab, displayCheck, locations],
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

  // ── Loading state: only when tab data is completely unavailable ──
  if (!tab) {
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

  // ── Error state: check failed to load OR prepare-check failed ──
  // IMPORTANT: checkError takes priority over displayCheck. The optimistic check
  // (computeOptimisticCheck) always returns non-null when the tab has items, which
  // previously masked prepare-check failures — the user could reach the tender step
  // and get "Order could not be prepared" with no way to retry.
  const hasNoItems = tab ? tab.lines.filter((l) => l.status !== 'voided').length === 0 : false;

  if (!displayCheck || checkError) {
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
                setCheckError(null);
                prepareCalledRef.current = null;
                preparePromiseRef.current = null;
                preparedOrderIdRef.current = null;
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
          check={displayCheck!}
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
