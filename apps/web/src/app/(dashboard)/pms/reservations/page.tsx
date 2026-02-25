'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ReservationsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/pms/calendar?view=list');
  }, [router]);
  return null;
}
