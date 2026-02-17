'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/toast';

export function useMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();

  const mutate = useCallback(
    async (input: TInput): Promise<TResult | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await mutationFn(input);
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error('An error occurred');
        setError(e);
        toast.error(e.message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [mutationFn, toast],
  );

  return { mutate, isLoading, error };
}
