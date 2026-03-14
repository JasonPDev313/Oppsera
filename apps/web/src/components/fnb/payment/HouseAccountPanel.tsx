'use client';

import { useState, useCallback } from 'react';
import { Building2, Search, AlertTriangle, ShieldCheck, Ban } from 'lucide-react';
import { formatCents } from '@oppsera/shared';
import { apiFetch } from '@/lib/api-client';
import { ManagerPinModal } from '../manager/ManagerPinModal';
import { SignaturePad } from './SignaturePad';
import type { HouseAccountMeta } from './PaymentScreen';

interface HouseAccountPanelProps {
  remainingCents: number;
  onTender: (amountCents: number, meta?: HouseAccountMeta) => void;
  disabled?: boolean;
}

interface CustomerAccount {
  customerId: string;
  customerName: string;
  memberNumber: string | null;
  billingAccountId: string;
  accountName: string;
  creditLimitCents: number;
  outstandingBalanceCents: number;
  availableCreditCents: number | null; // null = unlimited
  spendingLimitCents: number | null;   // null = no per-member cap
}

export function HouseAccountPanel({ remainingCents, onTender, disabled }: HouseAccountPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setError('');
    setAccount(null);
    setSignatureData(null);
    try {
      const res = await apiFetch<{ data: CustomerAccount }>(
        `/api/v1/fnb/payments/house-account/lookup?q=${encodeURIComponent(searchQuery.trim())}`,
      );
      setAccount(res.data);
    } catch (err: unknown) {
      // Surface specific block reasons from the API (403 = CMAA compliance gate)
      if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError('Customer not found or no house account on file');
      }
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Effective charge ceiling: min of available credit and per-member spending limit
  const effectiveAvailableCents = account
    ? (() => {
        const caps: number[] = [];
        if (account.availableCreditCents != null) caps.push(account.availableCreditCents);
        if (account.spendingLimitCents != null) caps.push(account.spendingLimitCents);
        return caps.length > 0 ? Math.min(...caps) : null; // null = unlimited
      })()
    : null;

  const chargeAmount = account
    ? effectiveAvailableCents != null
      ? Math.min(effectiveAvailableCents, remainingCents)
      : remainingCents // unlimited account — charge full remaining
    : 0;

  const exceedsCredit = account && effectiveAvailableCents != null
    ? remainingCents > effectiveAvailableCents
    : false;

  const buildMeta = useCallback((): HouseAccountMeta | undefined => {
    if (!account) return undefined;
    return {
      billingAccountId: account.billingAccountId,
      customerId: account.customerId,
      signatureData: signatureData ?? undefined,
    };
  }, [account, signatureData]);

  const handleCharge = useCallback(() => {
    if (!account || chargeAmount <= 0) return;
    onTender(chargeAmount, buildMeta());
  }, [account, chargeAmount, onTender, buildMeta]);

  // Override: charge even if exceeds available credit (requires manager PIN)
  const handleOverrideCharge = useCallback(async () => {
    onTender(remainingCents, buildMeta());
  }, [remainingCents, onTender, buildMeta]);

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
            placeholder="Member #, name, email, or phone"
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            // eslint-disable-next-line jsx-a11y/no-autofocus
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

        {/* Error / block reason */}
        {error && (
          <div
            className="flex items-center gap-1.5 text-xs"
            style={{ color: 'var(--fnb-danger)' }}
          >
            <Ban className="h-3 w-3 shrink-0" />
            {error}
          </div>
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
            {account.memberNumber && (
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--fnb-text-muted)' }}>Member #</span>
                <span
                  className="font-mono"
                  style={{ color: 'var(--fnb-text-secondary)', fontFamily: 'var(--fnb-font-mono)' }}
                >
                  {account.memberNumber}
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--fnb-text-muted)' }}>Account</span>
              <span style={{ color: 'var(--fnb-text-secondary)' }}>
                {account.accountName}
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
                {account.creditLimitCents > 0 ? formatCents(account.creditLimitCents) : 'Unlimited'}
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
                {formatCents(account.outstandingBalanceCents)}
              </span>
            </div>
            <div className="flex justify-between text-xs font-bold">
              <span style={{ color: 'var(--fnb-text-muted)' }}>Available Credit</span>
              <span
                className="font-mono"
                style={{
                  color: account.availableCreditCents == null || account.availableCreditCents > 0
                    ? 'var(--fnb-tender-house)'
                    : 'var(--fnb-danger)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                {account.availableCreditCents != null
                  ? formatCents(account.availableCreditCents)
                  : 'Unlimited'}
              </span>
            </div>
            {account.spendingLimitCents != null && (
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--fnb-text-muted)' }}>Member Limit</span>
                <span
                  className="font-mono"
                  style={{
                    color: 'var(--fnb-text-secondary)',
                    fontFamily: 'var(--fnb-font-mono)',
                  }}
                >
                  {formatCents(account.spendingLimitCents)}
                </span>
              </div>
            )}

            {/* CMAA: Signature capture (signed chit requirement) */}
            <SignaturePad onSignature={setSignatureData} />

            {/* Warning if charge exceeds available credit */}
            {exceedsCredit && effectiveAvailableCents != null && (
              <div
                className="flex items-center gap-1.5 text-[10px]"
                style={{ color: 'var(--fnb-warning)' }}
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Charge exceeds available credit by{' '}
                {formatCents(remainingCents - effectiveAvailableCents)}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCharge}
                disabled={disabled || chargeAmount <= 0 || !signatureData}
                className="flex-1 rounded-lg py-2 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: 'var(--fnb-tender-house)' }}
              >
                {!signatureData ? 'Sign to Charge' : `Charge ${formatCents(chargeAmount)}`}
              </button>

              {/* Override button for when exceeds credit */}
              {exceedsCredit && (
                <button
                  type="button"
                  onClick={() => setShowPinModal(true)}
                  disabled={disabled || !signatureData}
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
