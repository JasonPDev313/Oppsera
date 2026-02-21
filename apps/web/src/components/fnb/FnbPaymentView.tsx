'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { useFnbTab } from '@/hooks/use-fnb-tab';
import { usePaymentSession, usePreAuth, useTipActions } from '@/hooks/use-fnb-payments';
import { apiFetch } from '@/lib/api-client';
import { PaymentScreen } from './payment/PaymentScreen';
import type { CheckSummary } from '@/types/fnb';
import type { TenderType } from './payment/TenderGrid';
import type { ReceiptAction } from './payment/ReceiptOptions';
import { ArrowLeft } from 'lucide-react';

interface FnbPaymentViewProps {
  userId: string;
}

export function FnbPaymentView({ userId }: FnbPaymentViewProps) {
  const store = useFnbPosStore();
  const tabId = store.activeTabId;
  const { tab } = useFnbTab({ tabId });
  const { sessions, startSession, completeSession, recordTender } = usePaymentSession({
    tabId: tabId ?? '',
  });
  const { preauths, capturePreauth, voidPreauth } = usePreAuth({ tabId: tabId ?? undefined });
  const { adjustTip } = useTipActions();

  const [check, setCheck] = useState<CheckSummary | null>(null);
  const [isLoadingCheck, setIsLoadingCheck] = useState(false);

  // Fetch check summary
  useEffect(() => {
    if (!tab?.primaryOrderId) return;
    setIsLoadingCheck(true);
    apiFetch<{ data: CheckSummary }>(`/api/v1/fnb/tabs/${tab.id}/check?orderId=${tab.primaryOrderId}`)
      .then((res) => setCheck(res.data))
      .catch(() => {})
      .finally(() => setIsLoadingCheck(false));
  }, [tab?.id, tab?.primaryOrderId]);

  const handleBack = () => {
    store.navigateTo('tab');
  };

  const handleTender = useCallback(
    async (type: TenderType, amountCents: number, tipCents: number) => {
      if (!tab) return;
      // Start payment session if none active
      let sessionId = sessions.find((s) => s.status === 'in_progress')?.id;
      if (!sessionId) {
        const session = await startSession({
          tabId: tab.id,
          orderId: tab.primaryOrderId,
          totalAmountCents: check?.totalCents ?? 0,
        });
        sessionId = session.id;
      }

      // Record the tender
      await recordTender({
        sessionId,
        tenderId: crypto.randomUUID(),
        amountCents,
        tenderType: type,
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

      // Complete session if fully paid
      const totalPaid = (check?.paidCents ?? 0) + amountCents;
      if (totalPaid >= (check?.totalCents ?? 0)) {
        await completeSession(sessionId, { sessionId });
      }
    },
    [tab, sessions, check, startSession, recordTender, adjustTip, completeSession],
  );

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

  const handleReceipt = useCallback((_action: ReceiptAction) => {
    // Receipt printing/emailing handled by print service (Phase 10)
  }, []);

  const handleClose = useCallback(() => {
    store.navigateTo('floor');
    store.setActiveTab(null);
  }, [store]);

  if (!tab || isLoadingCheck) {
    return (
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>Loading payment...</p>
      </div>
    );
  }

  if (!check) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>No check available</p>
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors hover:opacity-80"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tab
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center justify-center rounded-lg h-8 w-8 transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-base font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            Payment — Tab #{tab.tabNumber}
          </h2>
        </div>
      </div>

      {/* Payment content */}
      <div className="flex-1 overflow-hidden">
        <PaymentScreen
          tab={tab}
          check={check}
          preauths={preauths}
          onTender={handleTender}
          onCapturePreAuth={handleCapturePreAuth}
          onVoidPreAuth={handleVoidPreAuth}
          onReceipt={handleReceipt}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}
