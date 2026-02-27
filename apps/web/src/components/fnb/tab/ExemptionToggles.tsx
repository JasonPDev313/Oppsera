'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { ulid } from 'ulid';

interface ExemptionTogglesProps {
  orderId: string;
  isTaxExempt: boolean;
  isServiceChargeExempt: boolean;
  onUpdate?: () => void;
}

export function ExemptionToggles({
  orderId,
  isTaxExempt,
  isServiceChargeExempt,
  onUpdate,
}: ExemptionTogglesProps) {
  const [taxExempt, setTaxExempt] = useState(isTaxExempt);
  const [svcExempt, setSvcExempt] = useState(isServiceChargeExempt);
  const [isSaving, setIsSaving] = useState(false);

  async function toggleTaxExempt() {
    if (isSaving) return;
    setIsSaving(true);
    const newValue = !taxExempt;
    setTaxExempt(newValue); // optimistic
    try {
      await apiFetch(`/api/v1/orders/${orderId}/tax-exempt`, {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: ulid(),
          taxExempt: newValue,
        }),
      });
      onUpdate?.();
    } catch {
      setTaxExempt(!newValue); // rollback
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleSvcExempt() {
    if (isSaving) return;
    setIsSaving(true);
    const newValue = !svcExempt;
    setSvcExempt(newValue); // optimistic
    try {
      await apiFetch(`/api/v1/orders/${orderId}/service-charge-exempt`, {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: ulid(),
          serviceChargeExempt: newValue,
        }),
      });
      onUpdate?.();
    } catch {
      setSvcExempt(!newValue); // rollback
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 shrink-0"
      style={{ borderTop: 'var(--fnb-border-subtle)' }}
    >
      <button
        type="button"
        onClick={toggleTaxExempt}
        disabled={isSaving}
        className="rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors"
        style={{
          backgroundColor: taxExempt ? 'rgba(245,158,11,0.1)' : 'var(--fnb-bg-elevated)',
          color: taxExempt ? 'var(--fnb-warning)' : 'var(--fnb-text-muted)',
          border: taxExempt ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
        }}
      >
        Tax Exempt
      </button>
      <button
        type="button"
        onClick={toggleSvcExempt}
        disabled={isSaving}
        className="rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors"
        style={{
          backgroundColor: svcExempt ? 'rgba(245,158,11,0.1)' : 'var(--fnb-bg-elevated)',
          color: svcExempt ? 'var(--fnb-warning)' : 'var(--fnb-text-muted)',
          border: svcExempt ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
        }}
      >
        Svc Exempt
      </button>
    </div>
  );
}
