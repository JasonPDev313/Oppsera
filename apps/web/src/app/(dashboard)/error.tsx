'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error so it's visible in devtools
    console.error('[DashboardError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          An error occurred while loading this page.
        </p>

        {/* Show error details in development */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs font-medium text-red-700">
              Error Details
            </summary>
            <div className="mt-2 max-h-60 overflow-auto rounded bg-red-100 p-3">
              <p className="text-xs font-bold text-red-800">{error.name}: {error.message}</p>
              {error.stack && (
                <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] text-red-700">
                  {error.stack}
                </pre>
              )}
              {error.digest && (
                <p className="mt-2 text-[10px] text-red-600">
                  Digest: {error.digest}
                </p>
              )}
            </div>
          </details>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <a
            href="/dashboard"
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
