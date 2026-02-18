'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, isAuthenticated } = useAuthContext();

  useEffect(() => {
    // Once auth state is resolved, redirect authenticated users away from auth pages
    if (!isLoading && isAuthenticated && pathname !== '/onboard') {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    );
  }

  // If authenticated (and not onboarding), don't render auth pages — redirect will fire
  if (isAuthenticated && pathname !== '/onboard') {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-lg">{children}</div>
    </div>
  );
}
