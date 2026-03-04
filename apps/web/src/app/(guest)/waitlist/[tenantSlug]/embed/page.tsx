'use client';

import dynamic from 'next/dynamic';

const WaitlistJoinContent = dynamic(() => import('../join-content'), {
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
    </div>
  ),
  ssr: false,
});

/**
 * Embed page — same join form as the standalone page, but rendered
 * inside the embed layout (full viewport, no 480px card).
 * Operators embed this via iframe on their website.
 */
export default function WaitlistEmbedPage() {
  return <WaitlistJoinContent />;
}
