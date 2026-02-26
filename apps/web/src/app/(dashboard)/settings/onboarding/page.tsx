'use client';

import dynamic from 'next/dynamic';

const OnboardingContent = dynamic(() => import('./onboarding-content'), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-3xl animate-pulse space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </div>
      </div>
      <div className="h-16 rounded-lg bg-muted" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-20 rounded-lg bg-muted" />
      ))}
    </div>
  ),
});

export default function OnboardingPage() {
  return <OnboardingContent />;
}
