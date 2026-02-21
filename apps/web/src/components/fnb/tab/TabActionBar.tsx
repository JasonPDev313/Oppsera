'use client';

import { Send, Flame, CreditCard, Split, Trash2 } from 'lucide-react';

interface TabActionBarProps {
  onSendAll: () => void;
  onFireNext: () => void;
  onPay: () => void;
  onSplit: () => void;
  onVoid: () => void;
  hasUnsentItems: boolean;
  disabled?: boolean;
}

export function TabActionBar({ onSendAll, onFireNext, onPay, onSplit, onVoid, hasUnsentItems, disabled }: TabActionBarProps) {
  const actions = [
    {
      key: 'send',
      label: 'Send All',
      icon: Send,
      onClick: onSendAll,
      color: 'var(--fnb-status-ordered)',
      show: hasUnsentItems,
    },
    {
      key: 'fire',
      label: 'Fire Next',
      icon: Flame,
      onClick: onFireNext,
      color: 'var(--fnb-status-entrees-fired)',
      show: true,
    },
    {
      key: 'split',
      label: 'Split',
      icon: Split,
      onClick: onSplit,
      color: 'var(--fnb-text-secondary)',
      show: true,
    },
    {
      key: 'void',
      label: 'Void',
      icon: Trash2,
      onClick: onVoid,
      color: 'var(--fnb-status-dirty)',
      show: true,
    },
    {
      key: 'pay',
      label: 'Pay',
      icon: CreditCard,
      onClick: onPay,
      color: 'var(--fnb-status-available)',
      show: true,
    },
  ].filter((a) => a.show);

  return (
    <div
      className="flex flex-wrap sm:flex-nowrap gap-1 px-2 py-2 border-t shrink-0"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        borderColor: 'rgba(148, 163, 184, 0.15)',
      }}
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            disabled={disabled}
            className="flex-1 flex flex-col items-center justify-center rounded-lg py-2.5 transition-colors hover:opacity-80 disabled:opacity-40"
            style={{
              backgroundColor: action.key === 'pay' ? action.color : 'var(--fnb-bg-elevated)',
              color: action.key === 'pay' ? '#fff' : action.color,
            }}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-semibold mt-0.5">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
