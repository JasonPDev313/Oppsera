'use client';

import { useState } from 'react';

interface MemberAuthFormProps {
  token: string;
  onSuccess: (data: {
    verificationId: string;
    emailHint: string;
    displayName: string;
  }) => void;
  onBack: () => void;
}

export function MemberAuthForm({ token, onSuccess, onBack }: MemberAuthFormProps) {
  const [memberNumber, setMemberNumber] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = memberNumber.trim().length > 0 && /^\d{4}$/.test(phoneLast4);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/v1/guest-pay/${token}/member-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberNumber: memberNumber.trim(), phoneLast4 }),
      });
      const json = await res.json();

      if (json.error) {
        const messages: Record<string, string> = {
          MEMBER_NOT_FOUND: 'Member not found. Please check your member number and phone number.',
          NO_EMAIL_ON_FILE: 'No email address on file for this member. Please see your server.',
          RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
          SESSION_NOT_ACTIVE: 'This check is no longer active.',
          SESSION_EXPIRED: 'This check has expired. Please ask your server for a new one.',
        };
        setError(messages[json.error.code] ?? json.error.message ?? 'Something went wrong');
        return;
      }

      onSuccess(json.data);
    } catch {
      setError('Unable to verify. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-foreground">Charge to Your Account</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your member number and the last 4 digits of your phone number to verify your identity.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Member Number
          </label>
          <input
            type="text"
            value={memberNumber}
            onChange={(e) => setMemberNumber(e.target.value)}
            placeholder="e.g. M12345"
            className="w-full rounded-xl border border-input px-4 py-3 text-base text-foreground bg-surface focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            autoComplete="off"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Last 4 Digits of Phone
          </label>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={4}
            value={phoneLast4}
            onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="1234"
            className="w-full rounded-xl border border-input px-4 py-3 text-base text-foreground bg-surface tracking-[0.3em] text-center focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            autoComplete="off"
            disabled={loading}
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="w-full rounded-2xl bg-green-600 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-green-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Verifying...' : 'Verify & Send Code'}
        </button>

        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="w-full py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Back
        </button>
      </div>
    </div>
  );
}
