'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type {
  ReceiptDocument,
  ReceiptBlock,
  HeaderBlock,
  OrderInfoBlock,
  ItemsBlock,
  TotalsBlock,
  PaymentBlock,
  FooterBlock,
} from '@oppsera/shared';
import LookupFallback from './lookup-fallback';

// ── Types ────────────────────────────────────────────────────────

type PageState = 'loading' | 'receipt' | 'not-found' | 'error';

interface ReceiptData {
  document: ReceiptDocument;
  variant: string;
  lookupCode: string;
  viewCount: number;
  createdAt: string;
}

// ── Main Component ───────────────────────────────────────────────

export default function ReceiptContent() {
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<PageState>('loading');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showLoyaltyForm, setShowLoyaltyForm] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/v1/receipts/public/${token}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setState(json.error.code === 'NOT_FOUND' ? 'not-found' : 'error');
          return;
        }
        setReceipt(json.data as ReceiptData);
        setState('receipt');
      })
      .catch(() => setState('error'));
  }, [token]);

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (state === 'not-found') {
    return (
      <div className="p-6">
        <div className="text-center mb-8 pt-8">
          <div className="text-4xl mb-3">🧾</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Receipt Not Found</h1>
          <p className="text-sm text-gray-500">
            This receipt may have expired or the link is invalid.
          </p>
        </div>
        <LookupFallback />
      </div>
    );
  }

  if (state === 'error' || !receipt) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">😕</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-500">Unable to load receipt. Please try again later.</p>
        </div>
      </div>
    );
  }

  const { document: doc } = receipt;
  const blocks = doc.blocks;

  const header = blocks.find((b: ReceiptBlock) => b.type === 'header') as HeaderBlock | undefined;
  const orderInfo = blocks.find((b: ReceiptBlock) => b.type === 'order_info') as OrderInfoBlock | undefined;
  const items = blocks.find((b: ReceiptBlock) => b.type === 'items') as ItemsBlock | undefined;
  const totals = blocks.find((b: ReceiptBlock) => b.type === 'totals') as TotalsBlock | undefined;
  const payment = blocks.find((b: ReceiptBlock) => b.type === 'payment') as PaymentBlock | undefined;
  const footer = blocks.find((b: ReceiptBlock) => b.type === 'footer') as FooterBlock | undefined;

  const handleEmailReceipt = async () => {
    if (!emailInput.trim() || emailSending) return;
    setEmailSending(true);
    try {
      const res = await fetch(`/api/v1/receipts/public/${token}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      const json = await res.json();
      if (json.data?.sent) {
        setEmailSent(true);
        setShowEmailForm(false);
      }
    } catch {
      // Silently fail — not critical
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="pb-8">
      {/* Business Header */}
      {header && (
        <div className="bg-indigo-600 text-white px-6 py-5 text-center">
          <h1 className="text-xl font-bold">{header.businessName}</h1>
          {header.locationName && (
            <p className="text-indigo-100 text-sm mt-1">{header.locationName}</p>
          )}
          {header.addressLines?.map((line, i) => (
            <p key={i} className="text-indigo-200 text-xs mt-0.5">{line}</p>
          ))}
          {header.phone && (
            <p className="text-indigo-200 text-xs mt-0.5">{header.phone}</p>
          )}
        </div>
      )}

      {/* Order Info */}
      {orderInfo && (
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Order</p>
              <p className="text-lg font-semibold text-gray-900">#{orderInfo.orderNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Date</p>
              <p className="text-sm text-gray-700">
                {new Date(orderInfo.orderDate).toLocaleDateString()}
              </p>
              <p className="text-xs text-gray-500">
                {new Date(orderInfo.orderDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          {(orderInfo.serverName || orderInfo.tableNumber) && (
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              {orderInfo.serverName && <span>Server: {orderInfo.serverName}</span>}
              {orderInfo.tableNumber && <span>Table: {orderInfo.tableNumber}</span>}
              {orderInfo.guestCount && <span>Guests: {orderInfo.guestCount}</span>}
            </div>
          )}
        </div>
      )}

      {/* Line Items */}
      {items && items.items.length > 0 && (
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="space-y-2">
            {items.items.filter((item) => !item.isVoided).map((item, i) => (
              <div key={i} className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    {item.qty > 1 && (
                      <span className="text-xs text-gray-500 font-medium">{item.qty}x</span>
                    )}
                    <span className={`text-sm text-gray-800 ${item.isComped ? 'line-through' : ''}`}>
                      {item.name}
                    </span>
                  </div>
                  {item.modifiers?.map((mod, j) => (
                    <p key={j} className="text-xs text-gray-400 ml-4 mt-0.5">
                      + {mod.name}
                      {mod.priceCents > 0 && ` (${formatCents(mod.priceCents)})`}
                    </p>
                  ))}
                  {item.specialInstructions && (
                    <p className="text-xs text-gray-400 italic ml-4 mt-0.5">{item.specialInstructions}</p>
                  )}
                </div>
                <span className="text-sm text-gray-800 ml-3 tabular-nums">
                  {formatCents(item.lineTotalCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      {totals && (
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCents(totals.subtotalCents)}</span>
            </div>
            {totals.discounts?.map((d, i) => (
              <div key={i} className="flex justify-between text-sm text-green-600">
                <span>{d.label}</span>
                <span className="tabular-nums">-{formatCents(d.amountCents)}</span>
              </div>
            ))}
            {totals.charges?.map((c, i) => (
              <div key={i} className="flex justify-between text-sm text-gray-600">
                <span>{c.label}</span>
                <span className="tabular-nums">{formatCents(c.amountCents)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm text-gray-600">
              <span>Tax</span>
              <span className="tabular-nums">{formatCents(totals.taxCents)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span className="tabular-nums">{formatCents(totals.totalCents)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Payment */}
      {payment && payment.tenders.length > 0 && (
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Payment</p>
          <div className="space-y-1.5">
            {payment.tenders.map((t, i) => (
              <div key={i} className="flex justify-between text-sm text-gray-700">
                <span>
                  {t.label}
                  {t.cardLast4 && ` ****${t.cardLast4}`}
                  {t.cardBrand && ` (${t.cardBrand})`}
                </span>
                <span className="tabular-nums">{formatCents(t.amountCents)}</span>
              </div>
            ))}
            {payment.changeCents > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Change</span>
                <span className="tabular-nums">{formatCents(payment.changeCents)}</span>
              </div>
            )}
            {payment.totalTipCents > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tip</span>
                <span className="tabular-nums">{formatCents(payment.totalTipCents)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Save PDF
          </button>
          {!emailSent ? (
            <button
              onClick={() => setShowEmailForm(!showEmailForm)}
              className="flex-1 py-2.5 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Email Receipt
            </button>
          ) : (
            <button
              disabled
              className="flex-1 py-2.5 px-4 bg-green-100 text-green-700 text-sm font-medium rounded-lg cursor-default"
            >
              Email Sent
            </button>
          )}
        </div>
        {showEmailForm && (
          <div className="mt-3 flex gap-2">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              onKeyDown={(e) => e.key === 'Enter' && handleEmailReceipt()}
            />
            <button
              onClick={handleEmailReceipt}
              disabled={emailSending || !emailInput.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {emailSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        )}
      </div>

      {/* Loyalty Signup */}
      <LoyaltySection
        token={token}
        show={showLoyaltyForm}
        onToggle={() => setShowLoyaltyForm(!showLoyaltyForm)}
      />

      {/* Survey Placeholder */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-500">Customer survey coming soon</p>
        </div>
      </div>

      {/* Footer */}
      {footer && (
        <div className="px-6 py-4 text-center">
          {footer.thankYouMessage && (
            <p className="text-sm text-gray-600 mb-2">{footer.thankYouMessage}</p>
          )}
          {footer.showReturnPolicy && footer.returnPolicyText && (
            <p className="text-xs text-gray-400">{footer.returnPolicyText}</p>
          )}
        </div>
      )}

      {/* Powered By */}
      <div className="px-6 pb-4 text-center">
        <p className="text-xs text-gray-300">
          Powered by OppsEra
        </p>
      </div>
    </div>
  );
}

// ── Loyalty Section ──────────────────────────────────────────────

function LoyaltySection({
  token,
  show,
  onToggle,
}: {
  token: string;
  show: boolean;
  onToggle: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [optedIn, setOptedIn] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Honeypot field — hidden from real users
  const [website, setWebsite] = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    if (!email.trim() && !phone.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/receipts/public/${token}/loyalty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          optedInMarketing: optedIn,
          website, // honeypot
        }),
      });
      const json = await res.json();
      if (json.data?.success) setSubmitted(true);
    } catch {
      // Silently fail
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-sm font-medium text-green-700">Thanks for signing up!</p>
          <p className="text-xs text-green-600 mt-1">We&apos;ll keep you in the loop.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 border-b border-gray-100">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <p className="text-sm font-medium text-gray-800">Join Our Loyalty Program</p>
          <p className="text-xs text-gray-500 mt-0.5">Get exclusive offers and rewards</p>
        </div>
        <span className="text-gray-400 text-lg">{show ? '−' : '+'}</span>
      </button>

      {show && (
        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name *"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {/* Honeypot field — invisible to real users */}
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0 }}
          />
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={optedIn}
              onChange={(e) => setOptedIn(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            I&apos;d like to receive marketing communications
          </label>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || (!email.trim() && !phone.trim())}
            className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Signing up...' : 'Sign Up'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
