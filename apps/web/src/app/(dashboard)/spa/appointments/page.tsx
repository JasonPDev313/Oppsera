'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SpaAppointmentsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/spa/calendar?view=list');
  }, [router]);

  return null;
}
