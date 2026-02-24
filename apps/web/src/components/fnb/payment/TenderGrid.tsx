'use client';

import { Banknote, CreditCard, Gift, Building2, Smartphone, Wallet, Zap } from 'lucide-react';

export type TenderType = 'cash' | 'card' | 'gift_card' | 'house_account';

interface TenderGridProps {
  onSelect: (type: TenderType) => void;
  /** Called when a fast-cash amount is selected (bypasses cash keypad) */
  onFastCash?: (amountCents: number) => void;
  /** Total remaining in cents — used for "Exact" fast cash */
  totalCents?: number;
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

const FAST_CASH = [
  { label: 'Exact', cents: 0 },
  { label: '$10', cents: 1000 },
  { label: '$20', cents: 2000 },
  { label: '$50', cents: 5000 },
  { label: '$100', cents: 10000 },
];

export function TenderGrid({ onSelect, onFastCash, totalCents, disabled }: TenderGridProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Tender type buttons */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {TENDERS.map(({ type, label, icon: Icon, color, secondaryIcons }) => (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            disabled={disabled}
            className="flex flex-col items-center justify-center rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 w-full"
            style={{
              minHeight: 72,
              borderColor: color,
              backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
              color,
            }}
          >
            <div className="flex items-center gap-1 mb-1">
              <Icon className="h-6 w-6" />
              {secondaryIcons?.map((SecIcon, i) => (
                <SecIcon key={i} className="h-3.5 w-3.5 opacity-50" />
              ))}
            </div>
            <span className="text-[11px] font-bold">{label}</span>
          </button>
        ))}
      </div>

      {/* Fast Cash row — one-tap cash payment */}
      {onFastCash && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Zap className="h-3 w-3" style={{ color: 'var(--fnb-tender-cash)' }} />
            <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--fnb-text-muted)' }}>
              Fast Cash
            </span>
          </div>
          <div className="flex gap-1.5">
            {FAST_CASH.map(({ label, cents }) => (
              <button
                key={label}
                type="button"
                onClick={() => onFastCash(cents === 0 ? (totalCents ?? 0) : cents)}
                disabled={disabled}
                className="flex-1 rounded-lg py-2.5 text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--fnb-tender-cash) 12%, transparent)',
                  color: 'var(--fnb-tender-cash)',
                  border: '1px solid color-mix(in srgb, var(--fnb-tender-cash) 25%, transparent)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
