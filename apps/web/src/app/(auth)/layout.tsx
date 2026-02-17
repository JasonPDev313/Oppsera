'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getStoredToken } from '@/lib/api-client';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    // Allow onboard page through even with a token (user has no tenant yet)
    if (token && pathname !== '/onboard') {
      router.replace('/');
    } else {
      setChecked(true);
    }
  }, [router, pathname]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">{children}</div>
    </div>
  );
}
