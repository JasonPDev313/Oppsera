'use client';

import { useState } from 'react';
import { CreditCard, Landmark, Plus } from 'lucide-react';
import { PaymentMethodCard } from './payment-method-card';
import { BankAccountCard } from './bank-account-card';
import { AddPaymentMethodDialog } from './add-payment-method-dialog';
import { AddBankAccountDialog } from './add-bank-account-dialog';
import { VerifyBankAccountDialog } from './verify-bank-account-dialog';
import {
  usePaymentMethods,
  usePaymentMethodMutations,
  useBankAccountMutations,
} from '@/hooks/use-payment-methods';

interface PaymentMethodsListProps {
  customerId: string;
}

export function PaymentMethodsList({ customerId }: PaymentMethodsListProps) {
  const { data: methods, isLoading, error, mutate } = usePaymentMethods(customerId);
  const { setDefault, removeMethod, isLoading: isActing } = usePaymentMethodMutations();
  const { removeBankAccount, isLoading: isBankActing } = useBankAccountMutations();
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddBank, setShowAddBank] = useState(false);
  const [verifyingMethodId, setVerifyingMethodId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const cards = methods?.filter((m) => m.paymentType !== 'bank_account') ?? [];
  const bankAccounts = methods?.filter((m) => m.paymentType === 'bank_account') ?? [];

  const handleSetDefault = async (methodId: string) => {
    try {
      await setDefault(customerId, methodId);
      mutate();
    } catch {
      // error is in the mutations hook
    }
  };

  const handleRemoveCard = async (methodId: string) => {
    if (confirmRemove !== methodId) {
      setConfirmRemove(methodId);
      return;
    }
    try {
      await removeMethod(customerId, methodId);
      setConfirmRemove(null);
      mutate();
    } catch {
      // error is in the mutations hook
    }
  };

  const handleRemoveBank = async (methodId: string) => {
    if (confirmRemove !== methodId) {
      setConfirmRemove(methodId);
      return;
    }
    try {
      await removeBankAccount(methodId);
      setConfirmRemove(null);
      mutate();
    } catch {
      // error is in the mutations hook
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-14 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-14 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600">Failed to load payment methods.</p>
        <button
          type="button"
          onClick={mutate}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const hasAny = cards.length > 0 || bankAccounts.length > 0;

  return (
    <div className="space-y-6 p-6">
      {/* ── Cards Section ────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Stored Cards
          </h3>
          <button
            type="button"
            onClick={() => setShowAddCard(true)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Card
          </button>
        </div>

        {cards.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 px-4 py-4">
            <CreditCard className="h-6 w-6 text-gray-300" />
            <p className="text-sm text-gray-400">No cards on file</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cards.map((method) => (
              <div key={method.id}>
                <PaymentMethodCard
                  method={method}
                  onSetDefault={handleSetDefault}
                  onRemove={handleRemoveCard}
                  isActing={isActing}
                />
                {confirmRemove === method.id && (
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs">
                    <span className="text-red-700">Remove this card?</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCard(method.id)}
                      disabled={isActing}
                      className="font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(null)}
                      className="font-medium text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bank Accounts Section ────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Bank Accounts
          </h3>
          <button
            type="button"
            onClick={() => setShowAddBank(true)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Bank Account
          </button>
        </div>

        {bankAccounts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 px-4 py-4">
            <Landmark className="h-6 w-6 text-gray-300" />
            <p className="text-sm text-gray-400">No bank accounts on file</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bankAccounts.map((method) => (
              <div key={method.id}>
                <BankAccountCard
                  method={method}
                  onSetDefault={handleSetDefault}
                  onRemove={handleRemoveBank}
                  onVerify={(id) => setVerifyingMethodId(id)}
                  isActing={isBankActing}
                />
                {confirmRemove === method.id && (
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs">
                    <span className="text-red-700">Remove this bank account?</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveBank(method.id)}
                      disabled={isBankActing}
                      className="font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(null)}
                      className="font-medium text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Empty state (no cards OR bank accounts) ───────────────── */}
      {!hasAny && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 py-8">
          <CreditCard className="h-8 w-8 text-gray-300" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-600">No payment methods on file</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Add a card or bank account to enable quick payments and autopay.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAddCard(true)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Add Card
            </button>
            <button
              type="button"
              onClick={() => setShowAddBank(true)}
              className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              Add Bank Account
            </button>
          </div>
        </div>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      {showAddCard && (
        <AddPaymentMethodDialog
          customerId={customerId}
          onClose={() => setShowAddCard(false)}
          onSuccess={() => {
            setShowAddCard(false);
            mutate();
          }}
        />
      )}

      {showAddBank && (
        <AddBankAccountDialog
          customerId={customerId}
          onClose={() => setShowAddBank(false)}
          onSuccess={() => {
            setShowAddBank(false);
            mutate();
          }}
        />
      )}

      {verifyingMethodId && (
        <VerifyBankAccountDialog
          paymentMethodId={verifyingMethodId}
          onClose={() => setVerifyingMethodId(null)}
          onSuccess={() => {
            setVerifyingMethodId(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}
