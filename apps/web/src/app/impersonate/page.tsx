'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setTokens } from '@/lib/api-client';

const IMPERSONATION_STORAGE_KEY = 'oppsera_impersonation';

function ImpersonateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('Missing impersonation token');
      setIsProcessing(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/v1/auth/impersonate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(
            (data as { error?: { message?: string } }).error?.message ||
              'Failed to start impersonation session',
          );
          setIsProcessing(false);
          return;
        }

        const data = await res.json();
        const { accessToken, refreshToken, impersonation } = data.data;

        // Store impersonation metadata in sessionStorage (tab-scoped, clears on close)
        sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(impersonation));

        // Store tokens in localStorage (same as normal login)
        setTokens(accessToken, refreshToken);

        // Redirect to dashboard
        router.replace('/dashboard');
      } catch {
        setError('Network error during impersonation');
        setIsProcessing(false);
      }
    })();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-lg text-center">
        {isProcessing ? (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-border border-t-indigo-600" />
            <p className="mt-4 text-sm text-muted-foreground">
              Starting impersonation session...
            </p>
          </>
        ) : (
          <>
            <p className="text-red-500 text-sm">{error}</p>
            <button
              onClick={() => window.close()}
              className="mt-4 inline-block text-sm text-indigo-600 hover:underline"
            >
              Close this tab
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-border border-t-indigo-600" />
        </div>
      }
    >
      <ImpersonateContent />
    </Suspense>
  );
}
