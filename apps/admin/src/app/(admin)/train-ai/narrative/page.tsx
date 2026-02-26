'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NarrativeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/train-ai/ai-behavior?tab=narrative');
  }, [router]);
  return null;
}
