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
        <div className="flex min-h-screen items-center justify-center bg-muted">
          <div className="w-full max-w-md rounded-xl bg-surface p-8 text-center shadow-lg">
            <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
            <p className="mt-2 text-sm text-muted-foreground">
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
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent/50"
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

  // Track whether the user was already authenticated when the initial
  // auth check completed.  This distinguishes two cases:
  //   (a) User navigated TO /signup with a stale session → should clear
  //   (b) User just signed up + logged in ON /signup → should NOT clear
  // Without this, a fresh login on /signup races with the stale-session
  // effect below: React re-renders with isAuthenticated=true while
  // pathname is still '/signup' (router.push hasn't completed), causing
  // logout() to wipe the tokens we just set.
  const wasAuthOnArrival = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isLoading && wasAuthOnArrival.current === null) {
      wasAuthOnArrival.current = isAuthenticated;
    }
  }, [isLoading, isAuthenticated]);

  // When visiting /signup with an existing session, auto-clear it so the
  // user can create a fresh account. Without this, the redirect effect
  // below sends them straight to /dashboard (stale tokens from a prior
  // session on the same browser).
  //
  // Only fires when wasAuthOnArrival is true — i.e., the user arrived at
  // /signup already authenticated (leftover tokens from a prior login).
  // If they arrived unauthenticated and then logged in on the signup page,
  // wasAuthOnArrival stays false and we skip the clearing.
  //
  // logout() is deduplicated at the module level — if the dashboard's
  // handleLogout already started one, this awaits the same promise
  // instead of starting a second concurrent logout.
  useEffect(() => {
    if (pathname === '/signup' && isAuthenticated && !logoutTriggered.current && wasAuthOnArrival.current) {
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
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-indigo-600" />
      </div>
    );
  }

  // Fully authenticated + has tenant → don't render auth pages, redirect will fire
  if (isAuthenticated && !needsOnboarding && pathname !== '/onboard' && !logoutTriggered.current) {
    return null;
  }

  // Unauthenticated on /onboard → show spinner while the onboard page's
  // redirect effect sends them to /login.  Without this gate, an expired
  // session lets the user see + interact with the wizard (and get 401 on Launch).
  if (!isAuthenticated && pathname === '/onboard') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-indigo-600" />
      </div>
    );
  }

  // Onboard page renders its own full-screen layout
  if (pathname === '/onboard') {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
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
