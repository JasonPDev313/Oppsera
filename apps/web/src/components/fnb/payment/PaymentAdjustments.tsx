'use client';

import { useState, useCallback } from 'react';
import { Percent, Tag, ShieldCheck } from 'lucide-react';
import { ManagerPinModal } from '../manager/ManagerPinModal';
import { apiFetch } from '@/lib/api-client';

interface PaymentAdjustmentsProps {
  tabId: string;
  onAdjusted: () => void;
  disabled?: boolean;
}

type AdjustmentMode = null | 'discount' | 'comp';
type DiscountType = 'percent' | 'fixed';

// Phase 4B: Large adjustment threshold requiring manager approval
const MANAGER_APPROVAL_THRESHOLD_CENTS = 5000; // $50
const MANAGER_APPROVAL_THRESHOLD_PERCENT = 20;

export function PaymentAdjustments({ tabId, onAdjusted, disabled }: PaymentAdjustmentsProps) {
  const [mode, setMode] = useState<AdjustmentMode>(null);
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [discountInput, setDiscountInput] = useState('');
  const [compReason, setCompReason] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const handleVerifyPin = useCallback(
    async (pin: string): Promise<boolean> => {
      try {
        const res = await apiFetch<{ data: { valid: boolean } }>(
          '/api/v1/fnb/manager/verify-pin',
          { method: 'POST', body: JSON.stringify({ pin }) },
        );
        if (res.data.valid) {
          setPinError(null);
          setShowPinModal(false);
          // Execute the pending action after successful PIN
          if (pendingAction) {
            await pendingAction();
            setPendingAction(null);
          }
          return true;
        }
        setPinError('Invalid PIN');
        return false;
      } catch {
        setPinError('Verification failed');
        return false;
      }
    },
    [pendingAction],
  );

  const applyDiscount = useCallback(async () => {
    if (!discountInput) return;
    setIsApplying(true);
    try {
      const value = parseFloat(discountInput);
      await apiFetch(`/api/v1/fnb/tabs/${tabId}/discount`, {
        method: 'POST',
        body: JSON.stringify({
          discountType,
          value,
          reason: 'Applied during payment',
          clientRequestId: crypto.randomUUID(),
        }),
      });
      setMode(null);
      setDiscountInput('');
      onAdjusted();
    } catch {
      // silent — let server error bubble
    } finally {
      setIsApplying(false);
    }
  }, [tabId, discountType, discountInput, onAdjusted]);

  const applyComp = useCallback(async () => {
    if (!compReason) return;
    setIsApplying(true);
    try {
      await apiFetch(`/api/v1/fnb/tabs/${tabId}/comp`, {
        method: 'POST',
        body: JSON.stringify({
          reason: compReason,
          clientRequestId: crypto.randomUUID(),
        }),
      });
      setMode(null);
      setCompReason('');
      onAdjusted();
    } catch {
      // silent
    } finally {
      setIsApplying(false);
    }
  }, [tabId, compReason, onAdjusted]);

  // Phase 4B: Check if manager PIN is required for the discount amount
  const handleApplyDiscount = useCallback(() => {
    if (!discountInput) return;
    const value = parseFloat(discountInput);
    const needsApproval =
      (discountType === 'fixed' && Math.round(value * 100) > MANAGER_APPROVAL_THRESHOLD_CENTS) ||
      (discountType === 'percent' && value > MANAGER_APPROVAL_THRESHOLD_PERCENT);

    if (needsApproval) {
      setPendingAction(() => applyDiscount);
      setShowPinModal(true);
    } else {
      applyDiscount();
    }
  }, [discountInput, discountType, applyDiscount]);

  // Comp always requires manager PIN
  const handleApplyComp = useCallback(() => {
    if (!compReason) return;
    setPendingAction(() => applyComp);
    setShowPinModal(true);
  }, [compReason, applyComp]);

  if (mode === null) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('discount')}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
          style={{
            backgroundColor: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-secondary)',
          }}
        >
          <Percent className="h-3.5 w-3.5" />
          Discount
        </button>
        <button
          type="button"
          onClick={() => setMode('comp')}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
          style={{
            backgroundColor: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-secondary)',
          }}
        >
          <Tag className="h-3.5 w-3.5" />
          Comp
        </button>
      </div>
    );
  }

  if (mode === 'discount') {
    return (
      <>
        <div
          className="rounded-xl p-3 flex flex-col gap-2"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-[10px] font-bold uppercase"
              style={{ color: 'var(--fnb-text-muted)' }}
            >
              Apply Discount
            </span>
            <button
              type="button"
              onClick={() => {
                setMode(null);
                setDiscountInput('');
              }}
              className="text-[10px] font-bold transition-colors hover:opacity-80"
              style={{ color: 'var(--fnb-text-muted)' }}
            >
              Cancel
            </button>
          </div>

          {/* Discount type toggle */}
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
            <button
              type="button"
              onClick={() => setDiscountType('percent')}
              className="flex-1 rounded-md py-1 text-[10px] font-bold transition-colors"
              style={{
                backgroundColor:
                  discountType === 'percent' ? 'var(--fnb-bg-surface)' : 'transparent',
                color:
                  discountType === 'percent'
                    ? 'var(--fnb-text-primary)'
                    : 'var(--fnb-text-muted)',
              }}
            >
              Percentage
            </button>
            <button
              type="button"
              onClick={() => setDiscountType('fixed')}
              className="flex-1 rounded-md py-1 text-[10px] font-bold transition-colors"
              style={{
                backgroundColor:
                  discountType === 'fixed' ? 'var(--fnb-bg-surface)' : 'transparent',
                color:
                  discountType === 'fixed'
                    ? 'var(--fnb-text-primary)'
                    : 'var(--fnb-text-muted)',
              }}
            >
              Dollar Amount
            </button>
          </div>

          {/* Input */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              {discountType === 'percent' ? '%' : '$'}
            </span>
            <input
              type="number"
              step={discountType === 'percent' ? '1' : '0.01'}
              min="0"
              max={discountType === 'percent' ? '100' : undefined}
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              placeholder={discountType === 'percent' ? '10' : '5.00'}
              className="flex-1 rounded-lg px-3 py-1.5 text-sm font-mono outline-none"
              style={{
                backgroundColor: 'var(--fnb-bg-primary)',
                color: 'var(--fnb-text-primary)',
                fontFamily: 'var(--fnb-font-mono)',
              }}
              autoFocus
            />
          </div>

          {/* Threshold warning */}
          {discountInput &&
            ((discountType === 'fixed' &&
              Math.round(parseFloat(discountInput) * 100) > MANAGER_APPROVAL_THRESHOLD_CENTS) ||
              (discountType === 'percent' &&
                parseFloat(discountInput) > MANAGER_APPROVAL_THRESHOLD_PERCENT)) && (
              <div
                className="flex items-center gap-1.5 text-[10px]"
                style={{ color: 'var(--fnb-warning)' }}
              >
                <ShieldCheck className="h-3 w-3 shrink-0" />
                Manager approval required
              </div>
            )}

          <button
            type="button"
            onClick={handleApplyDiscount}
            disabled={disabled || isApplying || !discountInput}
            className="rounded-lg py-2 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--fnb-status-available)' }}
          >
            {isApplying ? 'Applying...' : 'Apply Discount'}
          </button>
        </div>

        <ManagerPinModal
          open={showPinModal}
          onClose={() => {
            setShowPinModal(false);
            setPendingAction(null);
          }}
          onVerify={handleVerifyPin}
          error={pinError}
          title="Manager Approval Required"
        />
      </>
    );
  }

  // mode === 'comp'
  return (
    <>
      <div
        className="rounded-xl p-3 flex flex-col gap-2"
        style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] font-bold uppercase"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            Comp Check
          </span>
          <button
            type="button"
            onClick={() => {
              setMode(null);
              setCompReason('');
            }}
            className="text-[10px] font-bold transition-colors hover:opacity-80"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            Cancel
          </button>
        </div>

        {/* Predefined comp reasons */}
        <div className="flex flex-wrap gap-1">
          {['Kitchen Error', 'Service Recovery', 'VIP Guest', 'Manager Comp'].map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => setCompReason(reason)}
              className="rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors"
              style={{
                backgroundColor:
                  compReason === reason
                    ? 'color-mix(in srgb, var(--fnb-info) 15%, transparent)'
                    : 'var(--fnb-bg-primary)',
                color:
                  compReason === reason ? 'var(--fnb-info)' : 'var(--fnb-text-muted)',
                borderWidth: 1,
                borderColor:
                  compReason === reason ? 'var(--fnb-info)' : 'rgba(148, 163, 184, 0.1)',
              }}
            >
              {reason}
            </button>
          ))}
        </div>

        {/* Custom reason */}
        <input
          type="text"
          value={compReason}
          onChange={(e) => setCompReason(e.target.value)}
          placeholder="Enter comp reason..."
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{
            backgroundColor: 'var(--fnb-bg-primary)',
            color: 'var(--fnb-text-primary)',
          }}
        />

        <div
          className="flex items-center gap-1.5 text-[10px]"
          style={{ color: 'var(--fnb-warning)' }}
        >
          <ShieldCheck className="h-3 w-3 shrink-0" />
          Manager approval required
        </div>

        <button
          type="button"
          onClick={handleApplyComp}
          disabled={disabled || isApplying || !compReason}
          className="rounded-lg py-2 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--fnb-status-available)' }}
        >
          {isApplying ? 'Applying...' : 'Comp Check'}
        </button>
      </div>

      <ManagerPinModal
        open={showPinModal}
        onClose={() => {
          setShowPinModal(false);
          setPendingAction(null);
        }}
        onVerify={handleVerifyPin}
        error={pinError}
        title="Manager Approval Required"
      />
    </>
  );
}
