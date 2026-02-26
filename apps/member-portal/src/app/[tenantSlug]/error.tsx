'use client';

import Link from 'next/link';

export default function TenantError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-[var(--portal-text-muted)] mb-6">
          We had trouble loading this page. This is usually temporary.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-[var(--portal-primary)] text-white px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
          <Link
            href="/find-club"
            className="rounded-lg border border-[var(--portal-border)] px-5 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            Find Your Club
          </Link>
        </div>
      </div>
    </div>
  );
}
