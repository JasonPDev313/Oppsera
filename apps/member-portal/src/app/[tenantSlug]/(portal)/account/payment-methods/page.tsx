'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Trash2,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Shield,
  Star,
} from 'lucide-react';
import {
  usePortalPaymentMethods,
  useAddCard,
  useRemovePaymentMethod,
  useSetDefaultPaymentMethod,
  type PortalPaymentMethod,
} from '@/hooks/use-payment-methods';
import {
  usePortalBankAccounts,
  useRemoveBankAccount,
  useVerifyBankAccount,
  type PortalBankAccount,
} from '@/hooks/use-portal-data';
import { BankAccountForm } from '@/components/bank-account-form';
import { PaymentMethodCapture } from '@/components/payments/payment-method-capture';
import { useTokenizerConfig } from '@/hooks/use-tokenizer-config';
import type { TokenizeResult } from '@oppsera/shared';

// ── Helpers ──────────────────────────────────────────────────────

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

function expiryDisplay(month: number | null, year: number | null): string {
  if (!month || !year) return '';
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
}

// ── Card subcomponents ───────────────────────────────────────────

function CardItem({
  method,
  onDelete,
  onSetDefault,
}: {
  method: PortalPaymentMethod;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg">
            <CreditCard className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">
                {method.nickname ?? `${brandDisplay(method.brand)} ****${method.last4}`}
              </p>
              {method.isDefault && (
                <span className="text-xs font-medium text-[var(--portal-primary)] bg-blue-500/10 px-2 py-0.5 rounded-full">
                  Default
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--portal-text-muted)]">
              {brandDisplay(method.brand)} ****{method.last4}
              {method.expiryMonth && method.expiryYear && (
                <> &middot; Exp {expiryDisplay(method.expiryMonth, method.expiryYear)}</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!method.isDefault && (
            <button
              onClick={() => onSetDefault(method.id)}
              className="text-xs font-medium text-[var(--portal-text-muted)] hover:text-[var(--portal-primary)] flex items-center gap-1"
              title="Set as default"
            >
              <Star className="h-3.5 w-3.5" />
              Set Default
            </button>
          )}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 text-muted-foreground hover:text-red-600 rounded transition-colors"
              title="Remove card"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onDelete(method.id)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-[var(--portal-text-muted)] hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add Card Form ────────────────────────────────────────────────

function AddCardForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { config, isLoading: isConfigLoading, error: configError } = useTokenizerConfig();
  const { addCard, isSubmitting } = useAddCard();
  const [nickname, setNickname] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [tokenResult, setTokenResult] = useState<TokenizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleTokenize(result: TokenizeResult) {
    setTokenResult(result);
    setError(null);
  }

  async function handleSave() {
    if (!tokenResult) return;
    setError(null);

    // Build expiry as MMYY
    const expiry = tokenResult.expMonth && tokenResult.expYear
      ? `${String(tokenResult.expMonth).padStart(2, '0')}${String(tokenResult.expYear).slice(-2)}`
      : undefined;

    try {
      await addCard({
        clientRequestId: crypto.randomUUID(),
        token: tokenResult.token,
        expiry,
        nickname: nickname.trim() || undefined,
        isDefault,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save card');
    }
  }

  return (
    <div className="space-y-4">
      <PaymentMethodCapture
        config={config}
        isConfigLoading={isConfigLoading}
        configError={configError}
        onTokenize={handleTokenize}
        onError={(msg) => setError(msg)}
      />

      {tokenResult && (
        <div className="space-y-3 border-t border-[var(--portal-border)] pt-3">
          <div className="flex items-center gap-2 text-sm text-green-500">
            <CheckCircle2 className="h-4 w-4" />
            Card ending in {tokenResult.last4 ?? '****'} captured
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Nickname (optional)</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Personal Visa"
              className="w-full border border-[var(--portal-border)] rounded-lg px-3 py-2 text-sm bg-[var(--portal-surface)]"
              maxLength={50}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded"
            />
            Set as default payment method
          </label>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium border border-[var(--portal-border)] rounded-lg hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!tokenResult || isSubmitting}
          className="px-4 py-2 text-sm font-medium bg-[var(--portal-primary)] text-white rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
          Save Card
        </button>
      </div>
    </div>
  );
}

// ── Bank Account subcomponents ───────────────────────────────────

function VerificationBadge({ status }: { status: PortalBankAccount['verificationStatus'] }) {
  switch (status) {
    case 'verified':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="h-3 w-3" /> Verified
        </span>
      );
    case 'pending_micro':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
          <AlertCircle className="h-3 w-3" /> Pending Verification
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
          <AlertCircle className="h-3 w-3" /> Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          Unverified
        </span>
      );
  }
}

function VerifyForm({ account, onVerified }: { account: PortalBankAccount; onVerified: () => void }) {
  const [amount1, setAmount1] = useState('');
  const [amount2, setAmount2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { verify, isSubmitting } = useVerifyBankAccount();

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const a1 = parseInt(amount1, 10);
    const a2 = parseInt(amount2, 10);
    if (isNaN(a1) || isNaN(a2) || a1 < 1 || a1 > 99 || a2 < 1 || a2 > 99) {
      setError('Enter amounts between 1 and 99 cents.');
      return;
    }

    try {
      const result = await verify(account.id, a1, a2);
      if (result.verified) {
        onVerified();
      } else {
        setError(`Incorrect amounts. ${result.remainingAttempts} attempt(s) remaining.`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
  }

  return (
    <form onSubmit={handleVerify} className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <p className="text-sm text-yellow-500 mb-2">
        Two small deposits were sent to your bank account. Enter the amounts below to verify ownership.
      </p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <div className="flex items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-yellow-500 mb-1">Deposit 1 (cents)</label>
          <input
            type="number"
            min={1}
            max={99}
            value={amount1}
            onChange={(e) => setAmount1(e.target.value)}
            placeholder="e.g. 32"
            required
            disabled={isSubmitting}
            className="w-24 border border-yellow-500/30 rounded px-2 py-1.5 text-sm bg-surface disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-yellow-500 mb-1">Deposit 2 (cents)</label>
          <input
            type="number"
            min={1}
            max={99}
            value={amount2}
            onChange={(e) => setAmount2(e.target.value)}
            placeholder="e.g. 47"
            required
            disabled={isSubmitting}
            className="w-24 border border-yellow-500/30 rounded px-2 py-1.5 text-sm bg-surface disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-3 py-1.5 text-sm font-medium bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 flex items-center gap-1"
        >
          {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
          Verify
        </button>
      </div>
    </form>
  );
}

function BankAccountItem({
  account,
  onDelete,
  onSetDefault,
  onVerified,
}: {
  account: PortalBankAccount;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  onVerified: () => void;
}) {
  const [showVerify, setShowVerify] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const displayName = account.nickname ?? account.bankName ?? 'Bank Account';
  const accountTypeName = account.bankAccountType === 'savings' ? 'Savings' : 'Checking';

  return (
    <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{displayName}</p>
              {account.isDefault && (
                <span className="text-xs font-medium text-[var(--portal-primary)] bg-blue-500/10 px-2 py-0.5 rounded-full">
                  Default
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--portal-text-muted)]">
              {accountTypeName} ****{account.accountLast4}
              {account.bankRoutingLast4 && ` \u00B7 Routing ****${account.bankRoutingLast4}`}
            </p>
            <div className="mt-1">
              <VerificationBadge status={account.verificationStatus} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {account.verificationStatus === 'pending_micro' && (
            <button
              onClick={() => setShowVerify(!showVerify)}
              className="text-sm font-medium text-[var(--portal-primary)] hover:underline flex items-center gap-1"
            >
              <Shield className="h-3.5 w-3.5" />
              Verify
            </button>
          )}
          {!account.isDefault && (
            <button
              onClick={() => onSetDefault(account.id)}
              className="text-xs font-medium text-[var(--portal-text-muted)] hover:text-[var(--portal-primary)] flex items-center gap-1"
              title="Set as default"
            >
              <Star className="h-3.5 w-3.5" />
              Set Default
            </button>
          )}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 text-muted-foreground hover:text-red-600 rounded transition-colors"
              title="Remove bank account"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onDelete(account.id)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-[var(--portal-text-muted)] hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {showVerify && account.verificationStatus === 'pending_micro' && (
        <VerifyForm
          account={account}
          onVerified={() => {
            setShowVerify(false);
            onVerified();
          }}
        />
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function PaymentMethodsPage() {
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddBank, setShowAddBank] = useState(false);
  const { data: methods, isLoading: methodsLoading, error: methodsError, refresh: refreshMethods } = usePortalPaymentMethods();
  const { data: bankAccounts, isLoading: banksLoading, error: banksError, refresh: refreshBanks } = usePortalBankAccounts();
  const { removePaymentMethod } = useRemovePaymentMethod();
  const { setDefault } = useSetDefaultPaymentMethod();
  const { removeBankAccount } = useRemoveBankAccount();
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;

  const isLoading = methodsLoading || banksLoading;

  const cards = methods?.filter((m) => m.paymentType === 'card') ?? [];

  function refreshAll() {
    refreshMethods();
    refreshBanks();
  }

  async function handleDeleteCard(id: string) {
    try {
      await removePaymentMethod(id);
      refreshAll();
    } catch {
      // Error handled by hook
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await setDefault(id);
      refreshAll();
    } catch {
      // Error handled by hook
    }
  }

  async function handleDeleteBank(id: string) {
    try {
      await removeBankAccount(id);
      refreshAll();
    } catch {
      // Error handled by hook
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  const error = methodsError || banksError;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/${tenantSlug}/account`}
            className="text-[var(--portal-text-muted)] hover:text-[var(--portal-text)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold">Payment Methods</h1>
        </div>
        <div className="flex gap-2">
          {!showAddCard && !showAddBank && (
            <>
              <button
                onClick={() => { setShowAddCard(true); setShowAddBank(false); }}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-[var(--portal-primary)] text-white rounded-lg hover:opacity-90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Card
              </button>
              <button
                onClick={() => { setShowAddBank(true); setShowAddCard(false); }}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-[var(--portal-border)] rounded-lg hover:bg-accent transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Bank Account
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}

      {/* Add Card Form */}
      {showAddCard && (
        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            Add Credit or Debit Card
          </h2>
          <AddCardForm
            onSuccess={() => {
              setShowAddCard(false);
              refreshAll();
            }}
            onCancel={() => setShowAddCard(false)}
          />
        </div>
      )}

      {/* Add Bank Account Form */}
      {showAddBank && (
        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            Add Bank Account
          </h2>
          <BankAccountForm
            onSuccess={() => {
              setShowAddBank(false);
              refreshAll();
            }}
            onCancel={() => setShowAddBank(false)}
          />
        </div>
      )}

      {/* Cards Section */}
      {cards.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--portal-text-muted)] uppercase tracking-wide mb-3">
            Cards
          </h2>
          <div className="space-y-3">
            {cards.map((card) => (
              <CardItem
                key={card.id}
                method={card}
                onDelete={handleDeleteCard}
                onSetDefault={handleSetDefault}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bank Accounts Section */}
      {bankAccounts && bankAccounts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--portal-text-muted)] uppercase tracking-wide mb-3">
            Bank Accounts
          </h2>
          <div className="space-y-3">
            {bankAccounts.map((account) => (
              <BankAccountItem
                key={account.id}
                account={account}
                onDelete={handleDeleteBank}
                onSetDefault={handleSetDefault}
                onVerified={refreshAll}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {cards.length === 0 && (!bankAccounts || bankAccounts.length === 0) && !showAddCard && !showAddBank && (
        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-8 text-center">
          <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-[var(--portal-text-muted)] mb-4">
            No payment methods on file. Add a card or bank account to make payments.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setShowAddCard(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[var(--portal-primary)] text-white rounded-lg hover:opacity-90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Card
            </button>
            <button
              onClick={() => setShowAddBank(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-[var(--portal-border)] rounded-lg hover:bg-accent transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Bank Account
            </button>
          </div>
        </div>
      )}

      {/* Security Notice */}
      <div className="text-xs text-[var(--portal-text-muted)] flex items-start gap-2">
        <Shield className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Your payment information is securely tokenized and never stored in plain text.
          Card details are processed through our PCI-compliant payment partner.
        </p>
      </div>
    </div>
  );
}
