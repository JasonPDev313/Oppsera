'use client';

import { useState, useCallback } from 'react';
import { Printer, Mail, X, Send } from 'lucide-react';

export type ReceiptAction = 'print' | 'email' | 'none';

interface ReceiptOptionsProps {
  onSelect: (action: ReceiptAction, email?: string) => void;
  prefillEmail?: string;
  disabled?: boolean;
}

const OPTIONS: { action: ReceiptAction; label: string; icon: typeof Printer }[] = [
  { action: 'print', label: 'Print', icon: Printer },
  { action: 'email', label: 'Email', icon: Mail },
  { action: 'none', label: 'No Receipt', icon: X },
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

  // Phase 6A: Inline email capture
  if (showEmailInput) {
    return (
      <div className="flex flex-col gap-2">
        <span
          className="text-[10px] font-bold uppercase"
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
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
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
            className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--fnb-info)' }}
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowEmailInput(false)}
          className="text-xs font-bold transition-colors hover:opacity-80"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {OPTIONS.map(({ action, label, icon: Icon }) => (
        <button
          key={action}
          type="button"
          onClick={() => handleSelect(action)}
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
