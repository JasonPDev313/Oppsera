'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface MemberVerifyFormProps {
  token: string;
  verificationId: string;
  emailHint: string;
  displayName: string;
  onSuccess: (data: {
    memberId: string;
    displayName: string;
    billingAccountId: string;
    availableCreditCents: number | null;
  }) => void;
  onBack: () => void;
}

export function MemberVerifyForm({
  token,
  verificationId,
  emailHint,
  displayName,
  onSuccess,
  onBack,
}: MemberVerifyFormProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleDigitChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    setError(null);

    // Auto-advance
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [digits]);

  // Auto-submit when all 6 digits are entered
  useEffect(() => {
    const code = digits.join('');
    if (code.length === 6 && /^\d{6}$/.test(code)) {
      handleVerify(code);
    }
  }, [digits]); // handleVerify is intentionally omitted — auto-submit should not re-register

  const handleVerify = async (code: string) => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/v1/guest-pay/${token}/member-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId, code }),
      });
      const json = await res.json();

      if (json.error) {
        setDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();

        if (json.error.attemptsRemaining != null) {
          setAttemptsLeft(json.error.attemptsRemaining);
        }

        const messages: Record<string, string> = {
          INVALID_CODE: 'Incorrect code. Please try again.',
          CODE_EXPIRED: 'This code has expired. Please request a new one.',
          TOO_MANY_ATTEMPTS: 'Too many incorrect attempts. Please request a new code.',
          VERIFICATION_NOT_FOUND: 'Verification not found. Please start over.',
        };
        setError(messages[json.error.code] ?? json.error.message ?? 'Verification failed');
        return;
      }

      onSuccess(json.data);
    } catch {
      setError('Unable to verify. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResendCooldown(60);
    setError(null);
    // Resend re-uses the member-auth endpoint (user needs to re-enter credentials)
    // For simplicity, go back to auth form
    onBack();
  };

  return (
    <div className="px-4 py-6">
      <div className="mb-6 text-center">
        <h2 className="text-lg font-bold text-gray-900">Enter Verification Code</h2>
        <p className="text-sm text-gray-500 mt-1">
          Code sent to <span className="font-medium">{emailHint}</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Hi {displayName} — enter the 6-digit code from your email.
        </p>
      </div>

      {/* 6-digit input */}
      <div className="flex justify-center gap-2 mb-6">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="tel"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={loading}
            className="w-12 h-14 rounded-xl border-2 border-gray-300 text-center text-xl font-bold focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
            autoComplete="one-time-code"
          />
        ))}
      </div>

      {attemptsLeft != null && attemptsLeft > 0 && (
        <p className="text-center text-xs text-amber-600 mb-4">
          {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
        </p>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center mb-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0}
          className="w-full py-2 text-sm text-green-600 hover:text-green-700 disabled:text-gray-400"
        >
          {resendCooldown > 0
            ? `Resend code in ${resendCooldown}s`
            : 'Resend Code'}
        </button>

        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
        >
          Back
        </button>
      </div>
    </div>
  );
}
