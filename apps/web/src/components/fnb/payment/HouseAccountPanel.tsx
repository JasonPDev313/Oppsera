'use client';

import { useState, useCallback } from 'react';
import { Building2, Search, AlertTriangle, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { ManagerPinModal } from '../manager/ManagerPinModal';

interface HouseAccountPanelProps {
  remainingCents: number;
  onTender: (amountCents: number) => void;
  disabled?: boolean;
}

interface CustomerAccount {
  customerId: string;
  customerName: string;
  creditLimitCents: number;
  outstandingBalanceCents: number;
  availableCreditCents: number;
}

export function HouseAccountPanel({ remainingCents, onTender, disabled }: HouseAccountPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setError('');
    setAccount(null);
    try {
      const res = await apiFetch<{ data: CustomerAccount }>(
        `/api/v1/fnb/payments/house-account/lookup?q=${encodeURIComponent(searchQuery.trim())}`,
      );
      setAccount(res.data);
    } catch {
      setError('Customer not found or no house account on file');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleCharge = useCallback(() => {
    if (!account) return;
    const chargeAmount = Math.min(account.availableCreditCents, remainingCents);
    if (chargeAmount <= 0) return;
    onTender(chargeAmount);
  }, [account, remainingCents, onTender]);

  // Override: charge even if exceeds available credit (requires manager PIN)
  const handleOverrideCharge = useCallback(async () => {
    onTender(remainingCents);
  }, [remainingCents, onTender]);

  const handleVerifyPin = useCallback(
    async (pin: string): Promise<boolean> => {
      try {
        const res = await apiFetch<{ data: { valid: boolean } }>(
          '/api/v1/fnb/manager/verify-pin',
          { method: 'POST', body: JSON.stringify({ pin }) },
        );
        if (res.data.valid) {
          setPinError(null);
          setShowPinModal(false);
          await handleOverrideCharge();
          return true;
        }
        setPinError('Invalid PIN');
        return false;
      } catch {
        setPinError('Verification failed');
        return false;
      }
    },
    [handleOverrideCharge],
  );

  const exceedsCredit = account
    ? remainingCents > account.availableCreditCents
    : false;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4" style={{ color: 'var(--fnb-tender-house)' }} />
          <span
            className="text-[10px] font-bold uppercase"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            House Account
          </span>
        </div>

        {/* Customer search */}
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Customer name, email, or phone"
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={disabled || isSearching || !searchQuery.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--fnb-tender-house)' }}
          >
            <Search className="h-3.5 w-3.5" />
            {isSearching ? 'Searching...' : 'Find'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs" style={{ color: 'var(--fnb-danger)' }}>
            {error}
          </p>
        )}

        {/* Account info */}
        {account && (
          <div
            className="rounded-xl p-3 flex flex-col gap-2"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
          >
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--fnb-text-muted)' }}>Customer</span>
              <span className="font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                {account.customerName}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--fnb-text-muted)' }}>Credit Limit</span>
              <span
                className="font-mono"
                style={{
                  color: 'var(--fnb-text-secondary)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                {formatMoney(account.creditLimitCents)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--fnb-text-muted)' }}>Outstanding</span>
              <span
                className="font-mono"
                style={{
                  color: 'var(--fnb-text-secondary)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                {formatMoney(account.outstandingBalanceCents)}
              </span>
            </div>
            <div className="flex justify-between text-xs font-bold">
              <span style={{ color: 'var(--fnb-text-muted)' }}>Available Credit</span>
              <span
                className="font-mono"
                style={{
                  color: account.availableCreditCents > 0
                    ? 'var(--fnb-tender-house)'
                    : 'var(--fnb-danger)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                {formatMoney(account.availableCreditCents)}
              </span>
            </div>

            {/* Warning if charge exceeds available credit */}
            {exceedsCredit && (
              <div
                className="flex items-center gap-1.5 text-[10px]"
                style={{ color: 'var(--fnb-warning)' }}
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Charge exceeds available credit by{' '}
                {formatMoney(remainingCents - account.availableCreditCents)}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCharge}
                disabled={disabled || account.availableCreditCents <= 0}
                className="flex-1 rounded-lg py-2 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: 'var(--fnb-tender-house)' }}
              >
                Charge {formatMoney(Math.min(account.availableCreditCents, remainingCents))}
              </button>

              {/* Override button for when exceeds credit */}
              {exceedsCredit && (
                <button
                  type="button"
                  onClick={() => setShowPinModal(true)}
                  disabled={disabled}
                  className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-[10px] font-bold transition-colors hover:opacity-80 disabled:opacity-40"
                  style={{
                    backgroundColor: 'var(--fnb-payment-partial-bg)',
                    color: 'var(--fnb-warning)',
                  }}
                >
                  <ShieldCheck className="h-3 w-3" />
                  Override
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <ManagerPinModal
        open={showPinModal}
        onClose={() => {
          setShowPinModal(false);
          setPinError(null);
        }}
        onVerify={handleVerifyPin}
        error={pinError}
        title="Override Credit Limit"
      />
    </>
  );
}
