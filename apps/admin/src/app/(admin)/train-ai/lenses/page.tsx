'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LensesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/train-ai/ai-behavior?tab=lenses');
  }, [router]);
  return null;
}
