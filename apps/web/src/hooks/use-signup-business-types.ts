'use client';

import { useState, useEffect } from 'react';

export type SignupBusinessType = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconKey: string | null;
  categoryName: string | null;
  moduleCount: number;
};

export function useSignupBusinessTypes() {
  const [data, setData] = useState<SignupBusinessType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/v1/public/signup-types');
        if (!res.ok) throw new Error(`Failed to load business types: ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json.data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return { data, isLoading, error };
}
