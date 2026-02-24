'use client';

import { useState, useCallback } from 'react';
import { Gift, Search, AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface GiftCardPanelProps {
  remainingCents: number;
  onTender: (amountCents: number) => void;
  disabled?: boolean;
}

interface GiftCardBalance {
  cardNumber: string;
  balanceCents: number;
  status: string;
}

export function GiftCardPanel({ remainingCents, onTender, disabled }: GiftCardPanelProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [balance, setBalance] = useState<GiftCardBalance | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState('');

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handleCheckBalance = useCallback(async () => {
    if (!cardNumber.trim()) return;
    setIsChecking(true);
    setError('');
    setBalance(null);
    try {
      const res = await apiFetch<{ data: GiftCardBalance }>(
        `/api/v1/fnb/payments/gift-card/balance?cardNumber=${encodeURIComponent(cardNumber.trim())}`,
      );
      setBalance(res.data);
    } catch {
      setError('Card not found or unable to check balance');
    } finally {
      setIsChecking(false);
    }
  }, [cardNumber]);

  const handleApply = useCallback(() => {
    if (!balance) return;
    // If balance covers remaining, apply remaining. Otherwise apply full balance.
    const tenderAmount = Math.min(balance.balanceCents, remainingCents);
    onTender(tenderAmount);
  }, [balance, remainingCents, onTender]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Gift className="h-4 w-4" style={{ color: 'var(--fnb-tender-gift)' }} />
        <span
          className="text-[10px] font-bold uppercase"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          Gift Card
        </span>
      </div>

      {/* Card number input + check button */}
      <div className="flex gap-2">
        <input
          type="text"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          placeholder="Card number or scan barcode"
          className="flex-1 rounded-lg px-3 py-2 text-sm font-mono outline-none"
          style={{
            backgroundColor: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-primary)',
            fontFamily: 'var(--fnb-font-mono)',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCheckBalance();
          }}
          autoFocus
        />
        <button
          type="button"
          onClick={handleCheckBalance}
          disabled={disabled || isChecking || !cardNumber.trim()}
          className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--fnb-tender-gift)' }}
        >
          <Search className="h-3.5 w-3.5" />
          {isChecking ? 'Checking...' : 'Check'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs" style={{ color: 'var(--fnb-danger)' }}>
          {error}
        </p>
      )}

      {/* Balance result */}
      {balance && (
        <div
          className="rounded-xl p-3 flex flex-col gap-2"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
        >
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--fnb-text-muted)' }}>Card</span>
            <span
              className="font-mono font-bold"
              style={{
                color: 'var(--fnb-text-primary)',
                fontFamily: 'var(--fnb-font-mono)',
              }}
            >
              ····{balance.cardNumber.slice(-4)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--fnb-text-muted)' }}>Available Balance</span>
            <span
              className="font-mono font-bold"
              style={{
                color: 'var(--fnb-tender-gift)',
                fontFamily: 'var(--fnb-font-mono)',
              }}
            >
              {formatMoney(balance.balanceCents)}
            </span>
          </div>

          {/* Warning if balance doesn't cover remaining */}
          {balance.balanceCents < remainingCents && (
            <div
              className="flex items-center gap-1.5 text-[10px]"
              style={{ color: 'var(--fnb-warning)' }}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Balance covers {formatMoney(balance.balanceCents)} of{' '}
              {formatMoney(remainingCents)} — additional payment needed
            </div>
          )}

          <button
            type="button"
            onClick={handleApply}
            disabled={disabled || balance.balanceCents <= 0}
            className="rounded-lg py-2 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--fnb-tender-gift)' }}
          >
            Apply {formatMoney(Math.min(balance.balanceCents, remainingCents))}
          </button>
        </div>
      )}
    </div>
  );
}
