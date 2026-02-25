'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function PayLandingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const autoSubmittedRef = useRef(false);

  const handleLookup = useCallback(async (lookupCode: string) => {
    const trimmed = lookupCode.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError('Please enter a 6-character check code.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/guest-pay/lookup?code=${encodeURIComponent(trimmed)}`);
      const json = await res.json();

      if (json.error) {
        setError(json.error.message);
        setIsLoading(false);
        return;
      }

      // Redirect to the existing payment flow
      router.replace(`/pay/${json.data.token}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  }, [router]);

  // Auto-submit if ?code= is present (QR scan pre-fill)
  useEffect(() => {
    const codeParam = searchParams.get('code');
    if (codeParam && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      setCode(codeParam.toUpperCase().slice(0, 6));
      handleLookup(codeParam);
    }
  }, [searchParams, handleLookup]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
    setCode(val);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLookup(code);
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="px-6 pt-12 pb-6 text-center">
        <div className="text-4xl mb-3">🧾</div>
        <h1 className="text-xl font-bold text-gray-900">Pay Your Check</h1>
        <p className="text-sm text-gray-500 mt-2">
          Enter the 6-character code from your receipt
        </p>
      </div>

      {/* Code input form */}
      <form onSubmit={handleSubmit} className="px-6">
        <label htmlFor="check-code" className="block text-sm font-medium text-gray-700 mb-2">
          Check Code
        </label>
        <input
          id="check-code"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={6}
          value={code}
          onChange={handleInputChange}
          placeholder="A3F7K2"
          className="w-full text-center text-2xl tracking-[0.3em] font-mono
                     border border-gray-300 rounded-lg px-4 py-3
                     focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500
                     placeholder:text-gray-300 placeholder:tracking-[0.3em]"
          disabled={isLoading}
        />

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || code.length !== 6}
          className="w-full mt-4 bg-green-600 text-white font-semibold py-3 px-4 rounded-lg
                     hover:bg-green-700 transition-colors
                     disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Looking up...
            </span>
          ) : (
            'Look Up Check'
          )}
        </button>
      </form>

      {/* Help text */}
      <div className="px-6 mt-8 text-center">
        <p className="text-xs text-gray-400">
          The code is printed on your receipt below the QR code.
          <br />
          Ask your server if you need help.
        </p>
      </div>

      {/* Footer */}
      <div className="mt-auto px-6 pb-6 text-center">
        <p className="text-xs text-gray-400">Powered by OppsEra</p>
      </div>
    </div>
  );
}

export default function PayLandingContent() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
      </div>
    }>
      <PayLandingInner />
    </Suspense>
  );
}
