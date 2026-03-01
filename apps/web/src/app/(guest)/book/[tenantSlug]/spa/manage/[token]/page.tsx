'use client';

import dynamic from 'next/dynamic';

const ManageContent = dynamic(() => import('./manage-content'), {
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
    </div>
  ),
  ssr: false,
});

export default function ManageBookingPage() {
  return <ManageContent />;
}
