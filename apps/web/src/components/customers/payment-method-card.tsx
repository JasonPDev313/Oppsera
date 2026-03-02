'use client';

import { CreditCard, Star, Trash2, MoreVertical, ShieldCheck } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { StoredPaymentMethod } from '@/hooks/use-payment-methods';

const BRAND_COLORS: Record<string, string> = {
  visa: 'text-blue-500',
  mastercard: 'text-red-500',
  amex: 'text-blue-500',
  discover: 'text-orange-500',
};

function brandLabel(brand: string | null): string {
  if (!brand) return 'Card';
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
  };
  return map[brand.toLowerCase()] ?? brand;
}

function formatExpiry(month: number | null, year: number | null): string {
  if (month == null || year == null) return '';
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
}

function isExpired(month: number | null, year: number | null): boolean {
  if (month == null || year == null) return false;
  const now = new Date();
  const expDate = new Date(year, month); // month is 0-indexed, so this is first of next month
  return expDate < now;
}

interface PaymentMethodCardProps {
  method: StoredPaymentMethod;
  onSetDefault: (methodId: string) => void;
  onRemove: (methodId: string) => void;
  isActing?: boolean;
}

export function PaymentMethodCard({
  method,
  onSetDefault,
  onRemove,
  isActing,
}: PaymentMethodCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const expired = isExpired(method.expiryMonth, method.expiryYear);
  const brandColor = BRAND_COLORS[method.brand?.toLowerCase() ?? ''] ?? 'text-muted-foreground';

  // Close menu on outside click
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
          ? 'border-indigo-500/30 bg-indigo-500/5'
          : expired
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-border'
      }`}
    >
      {/* Left: Icon + details */}
      <div className="flex items-center gap-3 min-w-0">
        <CreditCard className={`h-5 w-5 shrink-0 ${brandColor}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {brandLabel(method.brand)}
            </span>
            <span className="text-sm text-muted-foreground">
              ····{method.last4 ?? '????'}
            </span>
            {method.isDefault && (
              <span className="inline-flex items-center gap-0.5 rounded bg-indigo-500/20 px-1.5 py-0.5 text-xs font-medium text-indigo-500">
                <Star className="h-3 w-3" />
                Default
              </span>
            )}
            {expired && (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs font-medium text-red-500">
                Expired
              </span>
            )}
            {method.providerProfileId && (
              <span className="inline-flex items-center gap-0.5 rounded bg-green-500/20 px-1.5 py-0.5 text-xs font-medium text-green-500">
                <ShieldCheck className="h-3 w-3" />
                Tokenized
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {method.nickname && (
              <span className="truncate max-w-[120px]">{method.nickname}</span>
            )}
            {method.nickname && method.expiryMonth != null && (
              <span className="text-muted-foreground/30">&middot;</span>
            )}
            {method.expiryMonth != null && (
              <span>Exp {formatExpiry(method.expiryMonth, method.expiryYear)}</span>
            )}
            {method.createdAt && (
              <>
                {(method.nickname || method.expiryMonth != null) && (
                  <span className="text-muted-foreground/30">&middot;</span>
                )}
                <span>Added {new Date(method.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions menu */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          disabled={isActing}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-border bg-surface py-1 shadow-lg">
            {!method.isDefault && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSetDefault(method.id);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
              >
                <Star className="h-4 w-4 text-muted-foreground" />
                Set as Default
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRemove(method.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10"
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
