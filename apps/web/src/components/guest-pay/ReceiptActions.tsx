'use client';

import { useState, useCallback } from 'react';
import { Download, Mail, Share2, Check, Loader2 } from 'lucide-react';

interface ReceiptActionsProps {
  token: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function ReceiptActions({ token }: ReceiptActionsProps) {
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const handleDownload = useCallback(() => {
    window.print();
  }, []);

  const handleShare = useCallback(async () => {
    try {
      await navigator.share({
        title: 'My Receipt',
        text: 'Here is my payment receipt.',
        url: window.location.href,
      });
    } catch {
      // User cancelled or share not supported
    }
  }, []);

  const handleSendEmail = useCallback(async () => {
    if (!isValidEmail(emailInput)) return;

    setEmailSending(true);
    setEmailError(null);

    try {
      const res = await fetch(`/api/v1/guest-pay/${token}/email-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput }),
      });
      const json = await res.json();

      if (json.error) {
        if (json.error.code === 'ALREADY_SENT') {
          setEmailSent(true);
        } else {
          setEmailError(json.error.message ?? 'Failed to send');
        }
        return;
      }

      setEmailSent(true);
      setShowEmailInput(false);
    } catch {
      setEmailError('Failed to send. Please try again.');
    } finally {
      setEmailSending(false);
    }
  }, [token, emailInput]);

  if (showEmailInput && !emailSent) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">
          Email your receipt
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              setEmailError(null);
            }}
            placeholder="your@email.com"
            className="flex-1 rounded-lg border border-input px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendEmail();
            }}
          />
          <button
            type="button"
            onClick={handleSendEmail}
            disabled={emailSending || !isValidEmail(emailInput)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white
                       hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {emailSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Send
          </button>
        </div>
        {emailError && (
          <p className="text-xs text-red-600">{emailError}</p>
        )}
        <button
          type="button"
          onClick={() => {
            setShowEmailInput(false);
            setEmailError(null);
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {/* Download / Print */}
      <button
        type="button"
        onClick={handleDownload}
        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground
                   hover:bg-accent transition-colors print:hidden"
      >
        <Download className="h-4 w-4" />
        Save
      </button>

      {/* Email */}
      <button
        type="button"
        onClick={() => !emailSent && setShowEmailInput(true)}
        disabled={emailSent}
        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground
                   hover:bg-accent transition-colors disabled:text-green-500 disabled:border-green-500/30 disabled:bg-green-500/10 print:hidden"
      >
        {emailSent ? (
          <>
            <Check className="h-4 w-4" />
            Sent
          </>
        ) : (
          <>
            <Mail className="h-4 w-4" />
            Email
          </>
        )}
      </button>

      {/* Share (mobile only) */}
      {canShare && (
        <button
          type="button"
          onClick={handleShare}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground
                     hover:bg-accent transition-colors print:hidden"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      )}
    </div>
  );
}
