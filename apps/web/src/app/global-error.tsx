'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ maxWidth: '480px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111' }}>
              Something went wrong
            </h2>
            <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
              A critical error occurred. This usually means a module failed to load.
            </p>

            {process.env.NODE_ENV === 'development' && (
              <div style={{ marginTop: '16px', textAlign: 'left', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#991b1b' }}>
                  {error.name}: {error.message}
                </p>
                {error.stack && (
                  <pre style={{ marginTop: '8px', fontSize: '10px', color: '#b91c1c', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '200px', overflow: 'auto' }}>
                    {error.stack}
                  </pre>
                )}
              </div>
            )}

            <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{ padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: '#fff', background: '#4f46e5', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                Try Again
              </button>
              <a
                href="/dashboard"
                style={{ padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: '#374151', textDecoration: 'none', borderRadius: '8px', border: '1px solid #d1d5db' }}
              >
                Go to Dashboard
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
