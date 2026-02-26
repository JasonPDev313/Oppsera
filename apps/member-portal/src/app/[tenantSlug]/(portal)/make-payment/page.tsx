'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Building2,
  Loader2,
  DollarSign,
  Info,
} from 'lucide-react';
import { usePortalAccount } from '@/hooks/use-portal-data';
import {
  usePortalPaymentMethods,
  useOneTimePayment,
  type PortalPaymentMethod,
  type OneTimePaymentResult,
} from '@/hooks/use-payment-methods';
import { PaymentMethodCapture } from '@/components/payments/payment-method-capture';
import { useTokenizerConfig } from '@/hooks/use-tokenizer-config';
import type { TokenizeResult } from '@oppsera/shared';

// ── Helpers ──────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function brandDisplay(brand: string | null): string {
  if (!brand) return 'Card';
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'Amex',
    discover: 'Discover',
  };
  return map[brand.toLowerCase()] ?? brand;
}

// ── Method Picker ────────────────────────────────────────────────

function MethodRadio({
  method,
  selected,
  onSelect,
}: {
  method: PortalPaymentMethod;
  selected: boolean;
  onSelect: () => void;
}) {
  const isCard = method.paymentType === 'card';
  const Icon = isCard ? CreditCard : Building2;
  const label = isCard
    ? `${brandDisplay(method.brand)} ****${method.last4}`
    : `${method.bankAccountType === 'savings' ? 'Savings' : 'Checking'} ****${method.last4}`;

  const disabled = method.paymentType === 'bank_account' && method.verificationStatus !== 'verified';

  return (
    <label
      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
        disabled
          ? 'opacity-50 cursor-not-allowed border-[var(--portal-border)]'
          : selected
            ? 'border-[var(--portal-primary)] bg-blue-500/10'
            : 'border-[var(--portal-border)] hover:border-border'
      }`}
    >
      <input
        type="radio"
        name="paymentMethod"
        checked={selected}
        onChange={onSelect}
        disabled={disabled}
        className="accent-[var(--portal-primary)]"
      />
      <Icon className={`h-4 w-4 ${isCard ? 'text-indigo-500' : 'text-blue-500'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {method.nickname ?? label}
        </p>
        {method.nickname && (
          <p className="text-xs text-[var(--portal-text-muted)]">{label}</p>
        )}
      </div>
      {method.isDefault && (
        <span className="text-xs font-medium text-[var(--portal-primary)] bg-blue-500/10 px-2 py-0.5 rounded-full shrink-0">
          Default
        </span>
      )}
      {disabled && (
        <span className="text-xs text-[var(--portal-text-muted)] shrink-0">Not verified</span>
      )}
    </label>
  );
}

// ── Result Display ───────────────────────────────────────────────

function PaymentResult({
  result,
  tenantSlug,
  onReset,
}: {
  result: OneTimePaymentResult;
  tenantSlug: string;
  onReset: () => void;
}) {
  const isSuccess = result.status === 'captured' || result.status === 'ach_pending';
  const isAch = result.status === 'ach_pending';

  if (isSuccess) {
    return (
      <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-6 text-center space-y-4">
        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${
          isAch ? 'bg-blue-500/10' : 'bg-green-500/10'
        }`}>
          {isAch ? (
            <Info className="h-6 w-6 text-blue-600" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {isAch ? 'Payment Submitted' : 'Payment Successful'}
          </h2>
          <p className="text-2xl font-bold mt-1">{formatMoney(result.amountCents)}</p>
        </div>
        {result.userMessage && (
          <p className="text-sm text-[var(--portal-text-muted)]">{result.userMessage}</p>
        )}
        {isAch && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-sm text-blue-500">
              ACH payments typically take 2-3 business days to process. You will see the payment reflected on your account once it clears.
            </p>
          </div>
        )}
        {result.providerRef && (
          <p className="text-xs text-[var(--portal-text-muted)]">
            Reference: {result.providerRef}
          </p>
        )}
        <Link
          href={`/${tenantSlug}/dashboard`}
          className="inline-block px-4 py-2 text-sm font-medium bg-[var(--portal-primary)] text-white rounded-lg hover:opacity-90 transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  // Declined or error
  return (
    <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-6 text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
        <AlertTriangle className="h-6 w-6 text-red-600" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-red-500">Payment Declined</h2>
        {result.userMessage && (
          <p className="text-sm text-[var(--portal-text-muted)] mt-1">{result.userMessage}</p>
        )}
        {result.suggestedAction && (
          <p className="text-sm text-[var(--portal-text-muted)] mt-1">{result.suggestedAction}</p>
        )}
      </div>
      <button
        onClick={onReset}
        className="inline-block px-4 py-2 text-sm font-medium bg-[var(--portal-primary)] text-white rounded-lg hover:opacity-90 transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function MakePaymentPage() {
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;

  const { data: account, isLoading: accountLoading } = usePortalAccount();
  const { data: methods, isLoading: methodsLoading } = usePortalPaymentMethods();
  const { makePayment, isSubmitting } = useOneTimePayment();

  const [amountInput, setAmountInput] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [tokenResult, setTokenResult] = useState<TokenizeResult | null>(null);
  const [result, setResult] = useState<OneTimePaymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { config, isLoading: configLoading, error: configError } = useTokenizerConfig({
    enabled: useNewCard,
  });

  const isLoading = accountLoading || methodsLoading;

  // Filter to usable methods (cards + verified bank accounts)
  const usableMethods = useMemo(() => {
    if (!methods) return [];
    return methods.filter((m) => {
      if (m.paymentType === 'card') return true;
      return m.verificationStatus === 'verified';
    });
  }, [methods]);

  // Auto-select default method
  const effectiveSelectedId = selectedMethodId ?? usableMethods.find((m) => m.isDefault)?.id ?? null;

  const amountCents = useMemo(() => {
    const parsed = parseFloat(amountInput);
    if (isNaN(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  }, [amountInput]);

  const canSubmit =
    amountCents >= 100 &&
    (effectiveSelectedId || (useNewCard && tokenResult)) &&
    !isSubmitting;

  async function handleSubmit() {
    setError(null);

    if (amountCents < 100) {
      setError('Minimum payment is $1.00');
      return;
    }

    try {
      let paymentResult: OneTimePaymentResult;

      if (useNewCard && tokenResult) {
        const expiry = tokenResult.expMonth && tokenResult.expYear
          ? `${String(tokenResult.expMonth).padStart(2, '0')}${String(tokenResult.expYear).slice(-2)}`
          : undefined;

        paymentResult = await makePayment({
          clientRequestId: crypto.randomUUID(),
          amountCents,
          token: tokenResult.token,
          expiry,
          paymentMethodType: 'card',
        });
      } else if (effectiveSelectedId) {
        const method = methods?.find((m) => m.id === effectiveSelectedId);
        paymentResult = await makePayment({
          clientRequestId: crypto.randomUUID(),
          amountCents,
          paymentMethodId: effectiveSelectedId,
          paymentMethodType: method?.paymentType === 'bank_account' ? 'ach' : 'card',
        });
      } else {
        setError('Please select a payment method');
        return;
      }

      setResult(paymentResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
    setTokenResult(null);
    setAmountInput('');
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  // Show result screen
  if (result) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href={`/${tenantSlug}/dashboard`}
            className="text-[var(--portal-text-muted)] hover:text-[var(--portal-text)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold">Payment</h1>
        </div>
        <PaymentResult result={result} tenantSlug={tenantSlug} onReset={handleReset} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${tenantSlug}/dashboard`}
          className="text-[var(--portal-text-muted)] hover:text-[var(--portal-text)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Make a Payment</h1>
      </div>

      {/* Account Balance */}
      {account && (
        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--portal-text-muted)]">Current Balance</p>
              <p className="text-2xl font-bold">{formatMoney(account.currentBalanceCents)}</p>
            </div>
            {account.creditLimitCents > 0 && (
              <div className="text-right">
                <p className="text-sm text-[var(--portal-text-muted)]">Credit Limit</p>
                <p className="text-lg font-semibold">{formatMoney(account.creditLimitCents)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Amount Input */}
      <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
        <label className="block text-sm font-semibold mb-2">Payment Amount</label>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="number"
            min="1"
            step="0.01"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0.00"
            className="w-full pl-10 pr-4 py-3 text-lg border border-[var(--portal-border)] rounded-lg bg-[var(--portal-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)] focus:border-transparent"
          />
        </div>
        {amountInput && amountCents < 100 && (
          <p className="text-xs text-red-600 mt-1">Minimum payment is $1.00</p>
        )}
      </div>

      {/* Payment Method Selection */}
      <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">Payment Method</h2>

        <div className="space-y-2">
          {/* Saved methods */}
          {methods?.map((method) => (
            <MethodRadio
              key={method.id}
              method={method}
              selected={!useNewCard && effectiveSelectedId === method.id}
              onSelect={() => {
                setSelectedMethodId(method.id);
                setUseNewCard(false);
                setTokenResult(null);
              }}
            />
          ))}

          {/* New card option */}
          <label
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              useNewCard
                ? 'border-[var(--portal-primary)] bg-blue-500/10'
                : 'border-[var(--portal-border)] hover:border-border'
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              checked={useNewCard}
              onChange={() => {
                setUseNewCard(true);
                setSelectedMethodId(null);
              }}
              className="accent-[var(--portal-primary)]"
            />
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Use a new card</p>
          </label>
        </div>

        {/* Inline card tokenizer for new card */}
        {useNewCard && (
          <div className="mt-4 p-3 border border-[var(--portal-border)] rounded-lg">
            <PaymentMethodCapture
              config={config}
              isConfigLoading={configLoading}
              configError={configError}
              onTokenize={(res) => {
                setTokenResult(res);
                setError(null);
              }}
              onError={(msg) => setError(msg)}
            />
            {tokenResult && (
              <div className="flex items-center gap-2 text-sm text-green-500 mt-2">
                <CheckCircle2 className="h-4 w-4" />
                Card ending in {tokenResult.last4 ?? '****'} ready
              </div>
            )}
          </div>
        )}

        {/* No methods */}
        {methods && methods.length === 0 && !useNewCard && (
          <p className="text-sm text-[var(--portal-text-muted)] mt-2">
            No saved payment methods.{' '}
            <Link
              href={`/${tenantSlug}/account/payment-methods`}
              className="text-[var(--portal-primary)] hover:underline"
            >
              Add one
            </Link>{' '}
            or use a new card above.
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-3 text-base font-semibold bg-[var(--portal-primary)] text-white rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>Pay {amountCents >= 100 ? formatMoney(amountCents) : ''}</>
        )}
      </button>
    </div>
  );
}
