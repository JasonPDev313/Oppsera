'use client';

import { Printer, Mail, X } from 'lucide-react';

export type ReceiptAction = 'print' | 'email' | 'none';

interface ReceiptOptionsProps {
  onSelect: (action: ReceiptAction) => void;
  disabled?: boolean;
}

const OPTIONS: { action: ReceiptAction; label: string; icon: typeof Printer }[] = [
  { action: 'print', label: 'Print', icon: Printer },
  { action: 'email', label: 'Email', icon: Mail },
  { action: 'none', label: 'No Receipt', icon: X },
];

export function ReceiptOptions({ onSelect, disabled }: ReceiptOptionsProps) {
  return (
    <div className="flex gap-2">
      {OPTIONS.map(({ action, label, icon: Icon }) => (
        <button
          key={action}
          type="button"
          onClick={() => onSelect(action)}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-colors hover:opacity-80 disabled:opacity-40"
          style={{
            backgroundColor: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-secondary)',
          }}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
