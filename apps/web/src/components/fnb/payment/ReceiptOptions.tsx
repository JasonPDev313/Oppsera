'use client';

import { useState, useCallback } from 'react';
import { Printer, Mail, X, Send } from 'lucide-react';

export type ReceiptAction = 'print' | 'email' | 'none';

interface ReceiptOptionsProps {
  onSelect: (action: ReceiptAction, email?: string) => void;
  prefillEmail?: string;
  disabled?: boolean;
}

const OPTIONS: {
  action: ReceiptAction;
  label: string;
  icon: typeof Printer;
  primary: boolean;
}[] = [
  { action: 'print', label: 'Print', icon: Printer, primary: true },
  { action: 'email', label: 'Email', icon: Mail, primary: false },
  { action: 'none', label: 'No Receipt', icon: X, primary: false },
];

// Simple email format validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function ReceiptOptions({ onSelect, prefillEmail, disabled }: ReceiptOptionsProps) {
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailInput, setEmailInput] = useState(prefillEmail ?? '');

  const handleSelect = useCallback(
    (action: ReceiptAction) => {
      if (action === 'email') {
        setShowEmailInput(true);
        return;
      }
      onSelect(action);
    },
    [onSelect],
  );

  const handleSendEmail = useCallback(() => {
    if (!isValidEmail(emailInput)) return;
    onSelect('email', emailInput);
  }, [emailInput, onSelect]);

  // Inline email capture
  if (showEmailInput) {
    return (
      <div className="flex flex-col gap-2 fnb-fade-scale-in">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          Email Receipt
        </span>
        <div className="flex gap-2">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="guest@example.com"
            className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
            }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendEmail();
            }}
          />
          <button
            type="button"
            onClick={handleSendEmail}
            disabled={disabled || !isValidEmail(emailInput)}
            className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
            style={{ backgroundColor: 'var(--fnb-info)' }}
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowEmailInput(false)}
          className="text-xs font-bold transition-all hover:opacity-80"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2 fnb-fade-scale-in">
      {OPTIONS.map(({ action, label, icon: Icon, primary }) => (
        <button
          key={action}
          type="button"
          onClick={() => handleSelect(action)}
          disabled={disabled}
          className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-xl py-3.5 font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
          style={{
            backgroundColor: primary
              ? 'color-mix(in srgb, var(--fnb-accent) 12%, transparent)'
              : 'var(--fnb-bg-elevated)',
            color: primary ? 'var(--fnb-accent)' : 'var(--fnb-text-secondary)',
            border: primary
              ? '1.5px solid color-mix(in srgb, var(--fnb-accent) 30%, transparent)'
              : '1.5px solid transparent',
          }}
        >
          <Icon className="h-5 w-5" />
          <span className="text-xs">{label}</span>
        </button>
      ))}
    </div>
  );
}
