'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, isAuthenticated, needsOnboarding, logout } = useAuthContext();
  const logoutTriggered = useRef(false);

  // When visiting /signup with an existing session, auto-clear it so the
  // user can create a fresh account. Without this, the redirect effect
  // below sends them straight to /dashboard (stale tokens from a prior
  // session on the same browser).
  useEffect(() => {
    if (pathname === '/signup' && isAuthenticated && !logoutTriggered.current) {
      logoutTriggered.current = true;
      logout();
    }
  }, [pathname, isAuthenticated, logout]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    // Don't redirect while a logout is in progress (signup page clears stale session)
    if (logoutTriggered.current) return;

    if (needsOnboarding) {
      // User is authenticated but has no tenant — send to onboard
      if (pathname !== '/onboard') {
        router.replace('/onboard');
      }
    } else {
      // Fully set up — redirect away from all auth pages (including /onboard)
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, needsOnboarding, router, pathname]);

  if (isLoading) {
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

  // Onboard page renders its own full-screen layout (wider container, step indicator)
  if (pathname === '/onboard') {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-lg">{children}</div>
    </div>
  );
}
