'use client';

import { Component, useEffect, useRef } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';

// ── Error boundary ──────────────────────────────────────────────
// Catches crashes in login/signup/onboard pages so they never kill
// the entire React tree.  Shows a simple recovery UI instead.
class AuthErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AuthErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="w-full max-w-md rounded-xl bg-surface p-8 text-center shadow-lg">
            <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
            <p className="mt-2 text-sm text-gray-600">
              An error occurred. Please try again.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = '/login'; }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200/50"
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Auth layout ─────────────────────────────────────────────────

function AuthLayoutInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, isAuthenticated, isLoggingOut, needsOnboarding, logout } = useAuthContext();
  const logoutTriggered = useRef(false);

  // When visiting /signup with an existing session, auto-clear it so the
  // user can create a fresh account. Without this, the redirect effect
  // below sends them straight to /dashboard (stale tokens from a prior
  // session on the same browser).
  //
  // logout() is deduplicated at the module level — if the dashboard's
  // handleLogout already started one, this awaits the same promise
  // instead of starting a second concurrent logout.
  useEffect(() => {
    if (pathname === '/signup' && isAuthenticated && !logoutTriggered.current) {
      logoutTriggered.current = true;
      logout();
    }
  }, [pathname, isAuthenticated, logout]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    // Don't redirect while a logout is in progress (signup page clears stale session)
    if (logoutTriggered.current || isLoggingOut) return;

    if (needsOnboarding) {
      if (pathname !== '/onboard') {
        router.replace('/onboard');
      }
    } else {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, isLoggingOut, needsOnboarding, router, pathname]);

  if (isLoading || isLoggingOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    );
  }

  // Fully authenticated + has tenant → don't render auth pages, redirect will fire
  if (isAuthenticated && !needsOnboarding && pathname !== '/onboard' && !logoutTriggered.current) {
    return null;
  }

  // Onboard page renders its own full-screen layout
  if (pathname === '/onboard') {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-lg">{children}</div>
    </div>
  );
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AuthErrorBoundary>
      <AuthLayoutInner>{children}</AuthLayoutInner>
    </AuthErrorBoundary>
  );
}
