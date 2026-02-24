'use client';

import { useState, useRef, useEffect } from 'react';
import { Landmark, Star, Trash2, MoreVertical, ShieldCheck, ShieldAlert, Clock } from 'lucide-react';
import type { StoredPaymentMethod } from '@/hooks/use-payment-methods';

function accountTypeLabel(type: string | null): string {
  if (!type) return 'Bank Account';
  return type === 'checking' ? 'Checking' : 'Savings';
}

const VERIFICATION_BADGES: Record<string, { label: string; class: string; icon: typeof ShieldCheck }> = {
  verified: { label: 'Verified', class: 'bg-green-100 text-green-700', icon: ShieldCheck },
  pending_micro: { label: 'Pending Verification', class: 'bg-yellow-100 text-yellow-700', icon: Clock },
  unverified: { label: 'Unverified', class: 'bg-gray-100 text-gray-600', icon: ShieldAlert },
  failed: { label: 'Verification Failed', class: 'bg-red-100 text-red-700', icon: ShieldAlert },
};

interface BankAccountCardProps {
  method: StoredPaymentMethod;
  onSetDefault: (methodId: string) => void;
  onRemove: (methodId: string) => void;
  onVerify?: (methodId: string) => void;
  isActing?: boolean;
}

export function BankAccountCard({
  method,
  onSetDefault,
  onRemove,
  onVerify,
  isActing,
}: BankAccountCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const verificationStatus = (method as any).verificationStatus ?? 'not_applicable';
  const bankAccountType = (method as any).bankAccountType ?? null;
  const bankName = (method as any).bankName ?? null;
  const routingLast4 = (method as any).bankRoutingLast4 ?? null;
  const badge = VERIFICATION_BADGES[verificationStatus];

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
        method.isDefault
          ? 'border-indigo-200 bg-indigo-50/50'
          : verificationStatus === 'failed'
            ? 'border-red-200 bg-red-50/30'
            : 'border-gray-200'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Landmark className="h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {bankName ?? accountTypeLabel(bankAccountType)}
            </span>
            <span className="text-sm text-gray-500">
              ····{method.last4 ?? '????'}
            </span>
            {method.isDefault && (
              <span className="inline-flex items-center gap-0.5 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
                <Star className="h-3 w-3" />
                Default
              </span>
            )}
            {badge && (
              <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${badge.class}`}>
                <badge.icon className="h-3 w-3" />
                {badge.label}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
            {bankAccountType && (
              <span>{accountTypeLabel(bankAccountType)}</span>
            )}
            {routingLast4 && (
              <>
                <span className="text-gray-300">&middot;</span>
                <span>Routing ····{routingLast4}</span>
              </>
            )}
            {method.nickname && (
              <>
                <span className="text-gray-300">&middot;</span>
                <span className="truncate max-w-[120px]">{method.nickname}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="relative shrink-0 flex items-center gap-1" ref={menuRef}>
        {verificationStatus === 'unverified' && onVerify && (
          <button
            type="button"
            onClick={() => onVerify(method.id)}
            disabled={isActing}
            className="rounded-lg px-2 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
          >
            Verify
          </button>
        )}
        {verificationStatus === 'pending_micro' && onVerify && (
          <button
            type="button"
            onClick={() => onVerify(method.id)}
            disabled={isActing}
            className="rounded-lg px-2 py-1 text-xs font-medium text-yellow-600 transition-colors hover:bg-yellow-50 disabled:opacity-50"
          >
            Enter Amounts
          </button>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          disabled={isActing}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-surface py-1 shadow-lg">
            {!method.isDefault && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSetDefault(method.id);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <Star className="h-4 w-4 text-gray-400" />
                Set as Default
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRemove(method.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
