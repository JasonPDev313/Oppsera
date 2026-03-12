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
  enabledModuleKeys: string[];
};

export function useSignupBusinessTypes() {
  const [data, setData] = useState<SignupBusinessType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch('/api/v1/public/signup-types', { signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to load business types: ${res.status}`);
        const json = await res.json();
        if (!controller.signal.aborted) {
          setData(json.data ?? []);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => { controller.abort(); };
  }, []);

  return { data, isLoading, error };
}
