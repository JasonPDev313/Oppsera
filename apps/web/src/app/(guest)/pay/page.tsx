'use client';

import dynamic from 'next/dynamic';

const PayLandingContent = dynamic(() => import('./pay-landing-content'), {
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
    </div>
  ),
  ssr: false,
});

export default function PayLandingPage() {
  return <PayLandingContent />;
}
