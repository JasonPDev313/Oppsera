'use client';

import { useState } from 'react';
import { POSSlidePanel } from './shared/POSSlidePanel';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Quick Button ──────────────────────────────────────────────────

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-500 active:scale-[0.97]"
    >
      {label}
    </button>
  );
}

// ── Custom Discount Input ─────────────────────────────────────────

function CustomDiscountInput({
  onApply,
}: {
  onApply: (type: string, value: number, reason: string) => void;
}) {
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  const handleApply = () => {
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) return;
    const finalValue = discountType === 'fixed' ? Math.round(val * 100) : val;
    onApply(discountType, finalValue, discountReason || `${discountValue}${discountType === 'percentage' ? '%' : ''} discount`);
  };

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground uppercase">Custom Discount</p>
      <div className="flex gap-2">
        <select
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
          className="rounded-lg border border-border px-2 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none"
        >
          <option value="percentage">%</option>
          <option value="fixed">$</option>
        </select>
        <input
          type="number"
          value={discountValue}
          onChange={(e) => setDiscountValue(e.target.value)}
          placeholder={discountType === 'percentage' ? 'e.g., 10' : 'e.g., 5.00'}
          min="0"
          step={discountType === 'percentage' ? '1' : '0.01'}
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <input
        type="text"
        value={discountReason}
        onChange={(e) => setDiscountReason(e.target.value)}
        placeholder="Reason (optional)"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={handleApply}
        disabled={!discountValue || parseFloat(discountValue) <= 0}
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        Apply Discount
      </button>
    </div>
  );
}

// ── Discount Dialog ───────────────────────────────────────────────

export interface DiscountDialogProps {
  open: boolean;
  onClose: () => void;
  subtotalCents: number;
  onApplyDiscount: (type: string, value: number, reason: string) => void;
}

export function DiscountDialog({ open, onClose, subtotalCents, onApplyDiscount }: DiscountDialogProps) {
  const handleQuick = (pct: number) => {
    onApplyDiscount('percentage', pct, `${pct}% discount`);
    onClose();
  };

  return (
    <POSSlidePanel open={open} onClose={onClose} title="Apply Discount">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Subtotal: {formatMoney(subtotalCents)}
        </p>
        <div className="flex gap-2">
          <QuickButton label="5%" onClick={() => handleQuick(5)} />
          <QuickButton label="10%" onClick={() => handleQuick(10)} />
          <QuickButton label="15%" onClick={() => handleQuick(15)} />
          <QuickButton label="20%" onClick={() => handleQuick(20)} />
        </div>
        <CustomDiscountInput
          onApply={(type, value, reason) => {
            onApplyDiscount(type, value, reason);
            onClose();
          }}
        />
      </div>
    </POSSlidePanel>
  );
}
