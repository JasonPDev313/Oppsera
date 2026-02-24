'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { TipSelector } from '@/components/guest-pay/TipSelector';
import { GuestReceiptCard } from '@/components/guest-pay/GuestReceiptCard';
import { PaymentButton } from '@/components/guest-pay/PaymentButton';
import { GuestPayConfirmation } from '@/components/guest-pay/GuestPayConfirmation';
import { MemberAccountBanner } from '@/components/guest-pay/MemberAccountBanner';
import { MemberAuthForm } from '@/components/guest-pay/MemberAuthForm';
import { MemberVerifyForm } from '@/components/guest-pay/MemberVerifyForm';
import { MemberChargeButton } from '@/components/guest-pay/MemberChargeButton';

type PageState =
  | 'loading'
  | 'review'
  | 'member-auth'
  | 'member-verify'
  | 'member-review'
  | 'processing'
  | 'confirmed'
  | 'expired'
  | 'error';

interface TokenizerConfigData {
  site: string;
  iframeUrl: string;
  isSandbox: boolean;
}

interface SessionData {
  restaurantName: string | null;
  tableLabel: string | null;
  status: string;
  subtotalCents: number;
  taxCents: number;
  serviceChargeCents: number;
  discountCents: number;
  totalCents: number;
  tipCents: number | null;
  tipSettings: {
    tipType: string;
    presets: number[];
    allowCustom: boolean;
    allowNoTip: boolean;
    calculationBase: string;
    roundingMode: string;
    maxTipPercent: number;
    maxTipAmountCents: number;
  } | null;
  expiresAt: string;
  paidAt: string | null;
  memberId?: string | null;
  memberDisplayName?: string | null;
  billingAccountId?: string | null;
}

interface MemberInfo {
  memberId: string;
  displayName: string;
  billingAccountId: string;
  availableCreditCents: number | null;
  verificationId?: string;
}

export default function GuestPayContent() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [state, setState] = useState<PageState>('loading');
  const [session, setSession] = useState<SessionData | null>(null);
  const [selectedTipCents, setSelectedTipCents] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  // Card payment state
  const [tokenizerConfig, setTokenizerConfig] = useState<TokenizerConfigData | null>(null);
  const [isCardProcessing, setIsCardProcessing] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  // Path B verification flow state
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState<string>('');
  const [verifyDisplayName, setVerifyDisplayName] = useState<string>('');

  // Fetch session data
  useEffect(() => {
    if (!token) return;

    fetch(`/api/v1/guest-pay/${token}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setState('error');
          setErrorMessage(json.error.message ?? 'Session not found');
          return;
        }
        const data = json.data as SessionData;
        setSession(data);

        // Path A: if session has member info, set it
        if (data.memberId && data.billingAccountId) {
          setMemberInfo({
            memberId: data.memberId,
            displayName: data.memberDisplayName ?? 'Member',
            billingAccountId: data.billingAccountId,
            availableCreditCents: null, // Will be checked at charge time
          });
        }

        if (data.status === 'paid') {
          setState('confirmed');
        } else if (data.status === 'expired' || data.status === 'invalidated' || data.status === 'superseded') {
          setState('expired');
        } else {
          setState('review');
          // Restore previously selected tip
          if (data.tipCents != null && data.tipCents > 0) {
            setSelectedTipCents(data.tipCents);
          }
        }
      })
      .catch(() => {
        setState('error');
        setErrorMessage('Unable to load payment details. Please try again.');
      });
  }, [token]);

  // Fetch tokenizer config (for real card payments in live mode)
  useEffect(() => {
    if (!token) return;
    if (process.env.NEXT_PUBLIC_GUEST_PAY_LIVE !== 'true') return;

    fetch(`/api/v1/guest-pay/${token}/tokenizer-config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) {
          setTokenizerConfig(json.data as TokenizerConfigData);
        }
      })
      .catch(() => {
        // Silent — tokenizer not available, will show "Coming Soon"
      });
  }, [token]);

  // Poll for status changes (every 5s)
  useEffect(() => {
    if (state !== 'review' && state !== 'processing' && state !== 'member-auth'
      && state !== 'member-verify' && state !== 'member-review') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/guest-pay/${token}/status`);
        const json = await res.json();
        if (json.data?.status === 'paid') {
          setState('confirmed');
        } else if (json.data?.status === 'expired' || json.data?.status === 'invalidated') {
          setState('expired');
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [token, state]);

  const handleTipChange = useCallback(async (tipCents: number) => {
    setSelectedTipCents(tipCents);
    // Persist tip selection to server
    try {
      await fetch(`/api/v1/guest-pay/${token}/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipAmountCents: tipCents }),
      });
    } catch {
      // Tip selection is best-effort; continue even if save fails
    }
  }, [token]);

  const handlePay = useCallback(async () => {
    setState('processing');
    try {
      const res = await fetch(`/api/v1/guest-pay/${token}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipAmountCents: selectedTipCents }),
      });
      const json = await res.json();
      if (json.error) {
        setState('review');
        setErrorMessage(json.error.message ?? 'Payment failed');
        return;
      }
      setPaymentMethod('simulated');
      setState('confirmed');
    } catch {
      setState('review');
      setErrorMessage('Payment failed. Please try again.');
    }
  }, [token, selectedTipCents]);

  // Real card payment handler (via CardPointe iFrame token)
  const handleCardPay = useCallback(async (data: { token: string; expiry?: string }) => {
    setIsCardProcessing(true);
    setCardError(null);
    try {
      const res = await fetch(`/api/v1/guest-pay/${token}/card-charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: data.token,
          tipAmountCents: selectedTipCents,
        }),
      });
      const json = await res.json();
      if (json.error) {
        setCardError(json.error.message ?? 'Payment failed');
        return;
      }
      setPaymentMethod('card');
      setState('confirmed');
    } catch {
      setCardError('Payment failed. Please try again.');
    } finally {
      setIsCardProcessing(false);
    }
  }, [token, selectedTipCents]);

  // Member charge handler (both Path A and Path B)
  const handleMemberCharge = useCallback(async () => {
    if (!memberInfo) return;
    setState('processing');
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/v1/guest-pay/${token}/member-charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipAmountCents: selectedTipCents,
          verificationId: memberInfo.verificationId,
        }),
      });
      const json = await res.json();
      if (json.error) {
        setState('member-review');
        setErrorMessage(json.error.message ?? 'Charge failed');
        return;
      }
      setPaymentMethod('member_charge');
      setState('confirmed');
    } catch {
      setState('member-review');
      setErrorMessage('Charge failed. Please try again.');
    }
  }, [token, selectedTipCents, memberInfo]);

  // ── Loading ─────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-3 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading your check...</p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">😕</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-500 mb-4">{errorMessage}</p>
          <p className="text-xs text-gray-400">Please ask your server for assistance.</p>
        </div>
      </div>
    );
  }

  // ── Expired / Invalidated ──────────────────────────────────────
  if (state === 'expired') {
    const isSuperseded = session?.status === 'superseded';
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">{isSuperseded ? '🔄' : '⏰'}</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            {isSuperseded ? 'A newer receipt was printed' : 'This check has expired'}
          </h1>
          <p className="text-sm text-gray-500">
            {isSuperseded
              ? 'Your server printed an updated receipt. Please scan the new QR code.'
              : 'Please ask your server for a new check.'}
          </p>
        </div>
      </div>
    );
  }

  // ── Confirmed ──────────────────────────────────────────────────
  if (state === 'confirmed' && session) {
    return (
      <GuestPayConfirmation
        totalCents={session.totalCents + selectedTipCents}
        tipCents={selectedTipCents}
        restaurantName={session.restaurantName}
        memberName={memberInfo?.displayName}
        paymentMethod={paymentMethod ?? undefined}
      />
    );
  }

  // ── Processing ─────────────────────────────────────────────────
  if (state === 'processing') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 mx-auto mb-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
          <p className="text-base font-medium text-gray-900">Processing payment...</p>
          <p className="text-sm text-gray-500 mt-1">Please don't close this page.</p>
        </div>
      </div>
    );
  }

  // ── Member Auth (Path B Step 1) ──────────────────────────────
  if (state === 'member-auth') {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="px-6 pt-8 pb-4 text-center">
          {session?.restaurantName && (
            <h1 className="text-xl font-bold text-gray-900">{session.restaurantName}</h1>
          )}
        </div>
        <MemberAuthForm
          token={token}
          onSuccess={(data) => {
            setVerificationId(data.verificationId);
            setEmailHint(data.emailHint);
            setVerifyDisplayName(data.displayName);
            setState('member-verify');
          }}
          onBack={() => setState('review')}
        />
      </div>
    );
  }

  // ── Member Verify (Path B Step 2) ────────────────────────────
  if (state === 'member-verify' && verificationId) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="px-6 pt-8 pb-4 text-center">
          {session?.restaurantName && (
            <h1 className="text-xl font-bold text-gray-900">{session.restaurantName}</h1>
          )}
        </div>
        <MemberVerifyForm
          token={token}
          verificationId={verificationId}
          emailHint={emailHint}
          displayName={verifyDisplayName}
          onSuccess={(data) => {
            setMemberInfo({
              memberId: data.memberId,
              displayName: data.displayName,
              billingAccountId: data.billingAccountId,
              availableCreditCents: data.availableCreditCents,
              verificationId: verificationId,
            });
            setState('member-review');
          }}
          onBack={() => setState('member-auth')}
        />
      </div>
    );
  }

  // ── Member Review (charge confirmation) ──────────────────────
  if (state === 'member-review' && session && memberInfo) {
    const tipBase = session.tipSettings?.calculationBase === 'total_with_tax'
      ? session.totalCents
      : session.subtotalCents;
    const grandTotal = session.totalCents + selectedTipCents;

    return (
      <div className="flex flex-col min-h-screen">
        <div className="px-6 pt-8 pb-4 text-center">
          {session.restaurantName && (
            <h1 className="text-xl font-bold text-gray-900">{session.restaurantName}</h1>
          )}
          {session.tableLabel && (
            <p className="text-sm text-gray-500 mt-1">{session.tableLabel}</p>
          )}
        </div>

        <div className="px-4">
          <GuestReceiptCard
            subtotalCents={session.subtotalCents}
            taxCents={session.taxCents}
            serviceChargeCents={session.serviceChargeCents}
            discountCents={session.discountCents}
            totalCents={session.totalCents}
          />
        </div>

        {session.tipSettings && (
          <div className="px-4 mt-4">
            <TipSelector
              tipSettings={session.tipSettings}
              baseCents={tipBase}
              selectedTipCents={selectedTipCents}
              onTipChange={handleTipChange}
            />
          </div>
        )}

        <div className="px-6 mt-4 py-3 border-t border-gray-100">
          <div className="flex justify-between items-center">
            <span className="text-base font-semibold text-gray-900">Total with Tip</span>
            <span className="text-xl font-bold text-gray-900">
              ${(grandTotal / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {errorMessage && (
          <div className="mx-4 mt-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        )}

        <div className="px-4 mt-4 mb-8">
          <MemberChargeButton
            memberName={memberInfo.displayName}
            totalCents={grandTotal}
            availableCreditCents={memberInfo.availableCreditCents}
            onCharge={handleMemberCharge}
            onCancel={() => {
              setErrorMessage(null);
              setState('review');
            }}
          />
        </div>

        <div className="mt-auto px-6 pb-6 text-center">
          <p className="text-xs text-gray-400">Powered by OppsEra</p>
        </div>
      </div>
    );
  }

  // ── Review (main state) ────────────────────────────────────────
  if (!session) return null;

  const tipBase = session.tipSettings?.calculationBase === 'total_with_tax'
    ? session.totalCents
    : session.subtotalCents;

  const grandTotal = session.totalCents + selectedTipCents;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="px-6 pt-8 pb-4 text-center">
        {session.restaurantName && (
          <h1 className="text-xl font-bold text-gray-900">{session.restaurantName}</h1>
        )}
        {session.tableLabel && (
          <p className="text-sm text-gray-500 mt-1">{session.tableLabel}</p>
        )}
      </div>

      {/* Path A: Member banner (auto-detected from tab) */}
      {memberInfo && session.memberId && (
        <MemberAccountBanner
          displayName={memberInfo.displayName}
          onChargeToAccount={() => setState('member-review')}
        />
      )}

      {/* Receipt card */}
      <div className="px-4">
        <GuestReceiptCard
          subtotalCents={session.subtotalCents}
          taxCents={session.taxCents}
          serviceChargeCents={session.serviceChargeCents}
          discountCents={session.discountCents}
          totalCents={session.totalCents}
        />
      </div>

      {/* Tip selector */}
      {session.tipSettings && (
        <div className="px-4 mt-4">
          <TipSelector
            tipSettings={session.tipSettings}
            baseCents={tipBase}
            selectedTipCents={selectedTipCents}
            onTipChange={handleTipChange}
          />
        </div>
      )}

      {/* Grand total */}
      <div className="px-6 mt-4 py-3 border-t border-gray-100">
        <div className="flex justify-between items-center">
          <span className="text-base font-semibold text-gray-900">Total with Tip</span>
          <span className="text-xl font-bold text-gray-900">
            ${(grandTotal / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="mx-4 mt-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* Pay button + member auth link */}
      <div className="px-4 mt-4 mb-8">
        <PaymentButton
          onPay={handlePay}
          onMemberAuth={
            // Show "Club Member?" link only if no member is already linked (Path A)
            !session.memberId ? () => setState('member-auth') : undefined
          }
          tokenizerConfig={tokenizerConfig}
          amountCents={grandTotal}
          onCardPay={handleCardPay}
          isCardProcessing={isCardProcessing}
          cardError={cardError}
        />
      </div>

      {/* Footer */}
      <div className="mt-auto px-6 pb-6 text-center">
        <p className="text-xs text-gray-400">
          Powered by OppsEra
        </p>
      </div>
    </div>
  );
}
