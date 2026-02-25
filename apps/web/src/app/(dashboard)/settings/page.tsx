'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings/general');
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
    </div>
  );
}
