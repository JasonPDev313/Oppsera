'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type LookupState = 'idle' | 'submitting' | 'error';

export default function LookupFallback() {
  const router = useRouter();
  const [state, setState] = useState<LookupState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const [lookupCode, setLookupCode] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [verifyMethod, setVerifyMethod] = useState<'total' | 'card'>('total');
  const [totalDollars, setTotalDollars] = useState('');
  const [cardLast4, setCardLast4] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('submitting');
    setErrorMsg('');

    const body: Record<string, unknown> = {
      lookupCode: lookupCode.trim().toUpperCase(),
      receiptNumber: receiptNumber.trim(),
    };

    if (verifyMethod === 'total') {
      const cents = Math.round(parseFloat(totalDollars) * 100);
      if (isNaN(cents) || cents <= 0) {
        setErrorMsg('Please enter a valid total amount.');
        setState('error');
        return;
      }
      body.totalCents = cents;
    } else {
      const last4 = cardLast4.trim();
      if (!/^\d{4}$/.test(last4)) {
        setErrorMsg('Please enter exactly 4 digits.');
        setState('error');
        return;
      }
      body.cardLast4 = last4;
    }

    try {
      const res = await fetch('/api/v1/receipts/public/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        setErrorMsg('Too many attempts. Please try again in a minute.');
        setState('error');
        return;
      }

      if (res.status === 404) {
        setErrorMsg('Receipt not found. Please check your details and try again.');
        setState('error');
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setErrorMsg(json?.error?.message ?? 'Something went wrong. Please try again.');
        setState('error');
        return;
      }

      const json = await res.json();
      const token = json.data?.token;
      if (token) {
        router.push(`/r/${token}`);
      } else {
        setErrorMsg('Unexpected response. Please try again.');
        setState('error');
      }
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
      setState('error');
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Look Up Your Receipt</h2>
      <p className="text-xs text-gray-500 mb-4">
        Enter the 6-character code from your printed receipt to find it.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Lookup Code */}
        <div>
          <label htmlFor="lookupCode" className="block text-xs font-medium text-gray-700 mb-1">
            Receipt Code
          </label>
          <input
            id="lookupCode"
            type="text"
            maxLength={6}
            value={lookupCode}
            onChange={(e) => setLookupCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
            placeholder="ABC123"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 tracking-widest font-mono uppercase"
            required
          />
        </div>

        {/* Receipt Number */}
        <div>
          <label htmlFor="receiptNumber" className="block text-xs font-medium text-gray-700 mb-1">
            Receipt Number
          </label>
          <input
            id="receiptNumber"
            type="text"
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
            placeholder="e.g. 1042"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            required
          />
        </div>

        {/* Verification Method Toggle */}
        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">Verify with:</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVerifyMethod('total')}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                verifyMethod === 'total'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Receipt Total
            </button>
            <button
              type="button"
              onClick={() => setVerifyMethod('card')}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                verifyMethod === 'card'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Card Last 4
            </button>
          </div>
        </div>

        {/* Verification Input */}
        {verifyMethod === 'total' ? (
          <div>
            <label htmlFor="totalAmount" className="block text-xs font-medium text-gray-700 mb-1">
              Receipt Total
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input
                id="totalAmount"
                type="number"
                step="0.01"
                min="0.01"
                value={totalDollars}
                onChange={(e) => setTotalDollars(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="cardLast4" className="block text-xs font-medium text-gray-700 mb-1">
              Last 4 Digits of Card
            </label>
            <input
              id="cardLast4"
              type="text"
              maxLength={4}
              value={cardLast4}
              onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ''))}
              placeholder="1234"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 tracking-widest font-mono"
              required
            />
          </div>
        )}

        {/* Error message */}
        {state === 'error' && errorMsg && (
          <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{errorMsg}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={state === 'submitting'}
          className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {state === 'submitting' ? 'Looking up...' : 'Find Receipt'}
        </button>
      </form>
    </div>
  );
}
