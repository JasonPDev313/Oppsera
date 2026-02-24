'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { Sparkles } from 'lucide-react';

// ── Insights layout ────────────────────────────────────────────────
// Guards access to the /insights section by checking the 'semantic'
// module entitlement. Redirects to /dashboard with a notice if the
// tenant does not have AI Insights enabled.

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  const { isModuleEnabled, isLoading } = useEntitlementsContext();
  const router = useRouter();

  const hasAccess = isModuleEnabled('semantic');

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      router.replace('/dashboard');
    }
  }, [isLoading, hasAccess, router]);

  // Entitlements still loading — show nothing to avoid flash
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    );
  }

  // No entitlement — render upgrade prompt while redirect fires
  if (!hasAccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center px-4">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
          <Sparkles className="h-8 w-8 text-indigo-400" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          AI Insights not enabled
        </h2>
        <p className="text-gray-500 max-w-sm text-sm">
          The AI Insights module is not included in your current plan. Contact your account manager to unlock natural-language analytics.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
