'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const JoinContent = dynamic(() => import('./join-content'), { ssr: false });

function JoinFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  );
}

export default function GuestWaitlistJoinPage() {
  return (
    <Suspense fallback={<JoinFallback />}>
      <JoinContent />
    </Suspense>
  );
}
