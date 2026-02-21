'use client';

import { useState } from 'react';
import { CreditCard, Check, XCircle } from 'lucide-react';

interface PreAuth {
  id: string;
  tabId: string;
  status: string;
  authAmountCents: number;
  cardLast4: string;
  cardBrand: string | null;
  authorizedAt: string;
}

interface PreAuthCaptureProps {
  preauths: PreAuth[];
  totalCents: number;
  onCapture: (preauthId: string, captureAmountCents: number, tipAmountCents: number) => void;
  onVoid: (preauthId: string) => void;
  disabled?: boolean;
}

export function PreAuthCapture({ preauths, totalCents, onCapture, onVoid, disabled }: PreAuthCaptureProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tipInput, setTipInput] = useState('');

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const tipCents = tipInput ? Math.round(parseFloat(tipInput) * 100) : 0;

  const activePreauths = preauths.filter((p) => p.status === 'authorized');

  if (activePreauths.length === 0) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--fnb-text-muted)' }}>
        <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No active pre-authorizations</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] font-bold uppercase px-1" style={{ color: 'var(--fnb-text-muted)' }}>
        Pre-Authorized Cards
      </span>

      {activePreauths.map((pa) => {
        const isSelected = selectedId === pa.id;
        return (
          <div key={pa.id}>
            <button
              type="button"
              onClick={() => setSelectedId(isSelected ? null : pa.id)}
              className="w-full flex items-center justify-between rounded-lg px-3 py-2 border transition-colors"
              style={{
                borderColor: isSelected ? 'var(--fnb-status-seated)' : 'rgba(148, 163, 184, 0.15)',
                backgroundColor: isSelected
                  ? 'color-mix(in srgb, var(--fnb-status-seated) 10%, transparent)'
                  : 'var(--fnb-bg-elevated)',
              }}
            >
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" style={{ color: 'var(--fnb-text-muted)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                  {pa.cardBrand ?? 'Card'} ····{pa.cardLast4}
                </span>
              </div>
              <span
                className="text-sm font-mono"
                style={{ color: 'var(--fnb-text-secondary)', fontFamily: 'var(--fnb-font-mono)' }}
              >
                Auth: {formatMoney(pa.authAmountCents)}
              </span>
            </button>

            {isSelected && (
              <div className="mt-2 flex flex-col gap-2 pl-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Tip $</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tipInput}
                    onChange={(e) => setTipInput(e.target.value)}
                    placeholder="0.00"
                    className="w-24 rounded px-2 py-1 text-sm font-mono outline-none"
                    style={{
                      backgroundColor: 'var(--fnb-bg-elevated)',
                      color: 'var(--fnb-text-primary)',
                      fontFamily: 'var(--fnb-font-mono)',
                    }}
                  />
                  <span className="text-xs font-mono" style={{ color: 'var(--fnb-text-muted)' }}>
                    Total: {formatMoney(totalCents + tipCents)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onCapture(pa.id, totalCents, tipCents)}
                    disabled={disabled}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
                    style={{ backgroundColor: 'var(--fnb-status-available)' }}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Capture
                  </button>
                  <button
                    type="button"
                    onClick={() => onVoid(pa.id)}
                    disabled={disabled}
                    className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
                    style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-status-dirty)' }}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Void
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
