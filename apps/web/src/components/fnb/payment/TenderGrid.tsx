'use client';

import { Banknote, CreditCard, Gift, Building2, Smartphone, Wallet } from 'lucide-react';

export type TenderType = 'cash' | 'card' | 'gift_card' | 'house_account';

interface TenderGridProps {
  onSelect: (type: TenderType) => void;
  disabled?: boolean;
}

const TENDERS: {
  type: TenderType;
  label: string;
  icon: typeof Banknote;
  color: string;
  secondaryIcons?: (typeof Banknote)[];
}[] = [
  { type: 'cash', label: 'Cash', icon: Banknote, color: 'var(--fnb-tender-cash)' },
  {
    type: 'card',
    label: 'Card',
    icon: CreditCard,
    color: 'var(--fnb-tender-card)',
    secondaryIcons: [Smartphone, Wallet],
  },
  { type: 'gift_card', label: 'Gift Card', icon: Gift, color: 'var(--fnb-tender-gift)' },
  { type: 'house_account', label: 'House Acct', icon: Building2, color: 'var(--fnb-tender-house)' },
];

export function TenderGrid({ onSelect, disabled }: TenderGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {TENDERS.map(({ type, label, icon: Icon, color, secondaryIcons }) => (
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
          <div className="flex items-center gap-1 mb-1">
            <Icon className="h-6 w-6" />
            {/* Phase 6D: Secondary payment branding icons (Apple Pay / Google Pay hint) */}
            {secondaryIcons?.map((SecIcon, i) => (
              <SecIcon key={i} className="h-3.5 w-3.5 opacity-50" />
            ))}
          </div>
          <span className="text-[11px] font-bold">{label}</span>
        </button>
      ))}
    </div>
  );
}
