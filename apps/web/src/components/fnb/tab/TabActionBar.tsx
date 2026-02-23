'use client';

import { Send, Flame, CreditCard, Split, Trash2, QrCode, FileText } from 'lucide-react';

interface TabActionBarProps {
  onSendAll: () => void;
  onFireNext: () => void;
  onPay: () => void;
  onSplit: () => void;
  onVoid: () => void;
  onPrintCheck?: () => void;
  hasUnsentItems: boolean;
  guestPayEnabled?: boolean;
  disabled?: boolean;
}

export function TabActionBar({
  onSendAll,
  onFireNext,
  onPay,
  onSplit,
  onVoid,
  onPrintCheck,
  hasUnsentItems,
  guestPayEnabled,
  disabled,
}: TabActionBarProps) {
  const CheckIcon = guestPayEnabled ? QrCode : FileText;

  return (
    <div
      className="shrink-0 px-2 py-2"
      style={{ backgroundColor: 'var(--fnb-bg-surface)', borderTop: 'var(--fnb-border-subtle)' }}
    >
      {/* Row 1: Send All, Fire Next */}
      <div className="flex gap-1.5 mb-1.5">
        <button
          type="button"
          onClick={onSendAll}
          disabled={disabled || !hasUnsentItems}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold uppercase transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--fnb-action-send)',
            color: '#fff',
            minHeight: 'var(--fnb-touch-min)',
          }}
        >
          <Send className="h-4 w-4" />
          SEND ALL
        </button>
        <button
          type="button"
          onClick={onFireNext}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold uppercase transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--fnb-action-fire)',
            color: '#fff',
            minHeight: 'var(--fnb-touch-min)',
          }}
        >
          <Flame className="h-4 w-4" />
          FIRE NEXT
        </button>
      </div>

      {/* Row 2: Split, Print Check */}
      <div className="flex gap-1.5 mb-1.5">
        <button
          type="button"
          onClick={onSplit}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold uppercase transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--fnb-action-split)',
            color: '#fff',
            minHeight: 'var(--fnb-touch-min)',
          }}
        >
          <Split className="h-4 w-4" />
          SPLIT
        </button>
        {onPrintCheck && (
          <button
            type="button"
            onClick={onPrintCheck}
            disabled={disabled}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold uppercase transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'transparent',
              border: '2px solid var(--fnb-text-muted)',
              color: 'var(--fnb-text-primary)',
              minHeight: 'var(--fnb-touch-min)',
            }}
          >
            <CheckIcon className="h-4 w-4" />
            PRINT CHECK
          </button>
        )}
      </div>

      {/* Row 3: Void, Pay (2x width) */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onVoid}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold uppercase transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'transparent',
            border: '2px solid var(--fnb-action-void)',
            color: 'var(--fnb-action-void)',
            minHeight: 'var(--fnb-touch-min)',
          }}
        >
          <Trash2 className="h-4 w-4" />
          VOID
        </button>
        <button
          type="button"
          onClick={onPay}
          disabled={disabled}
          className="flex-2 flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold uppercase transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--fnb-action-pay)',
            color: '#fff',
            minHeight: 'var(--fnb-touch-min)',
          }}
        >
          <CreditCard className="h-4 w-4" />
          PAY
        </button>
      </div>
    </div>
  );
}
