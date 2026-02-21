'use client';

import { Banknote, CreditCard, Gift, Building2 } from 'lucide-react';

export type TenderType = 'cash' | 'card' | 'gift_card' | 'house_account';

interface TenderGridProps {
  onSelect: (type: TenderType) => void;
  disabled?: boolean;
}

const TENDERS: { type: TenderType; label: string; icon: typeof Banknote; color: string }[] = [
  { type: 'cash', label: 'Cash', icon: Banknote, color: 'var(--fnb-status-available)' },
  { type: 'card', label: 'Card', icon: CreditCard, color: 'var(--fnb-status-seated)' },
  { type: 'gift_card', label: 'Gift Card', icon: Gift, color: 'var(--fnb-status-dessert)' },
  { type: 'house_account', label: 'House Acct', icon: Building2, color: 'var(--fnb-status-ordered)' },
];

export function TenderGrid({ onSelect, disabled }: TenderGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {TENDERS.map(({ type, label, icon: Icon, color }) => (
        <button
          key={type}
          type="button"
          onClick={() => onSelect(type)}
          disabled={disabled}
          className="flex flex-col items-center justify-center rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 w-full sm:w-20"
          style={{
            minHeight: 72,
            borderColor: color,
            backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
            color,
          }}
        >
          <Icon className="h-6 w-6 mb-1" />
          <span className="text-[11px] font-bold">{label}</span>
        </button>
      ))}
    </div>
  );
}
