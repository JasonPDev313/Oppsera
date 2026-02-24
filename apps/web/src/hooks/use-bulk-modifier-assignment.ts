'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface BulkAssignInput {
  itemIds: string[];
  modifierGroupIds: string[];
  mode: 'merge' | 'replace';
  overrides?: {
    overrideRequired?: boolean;
    overrideMinSelections?: number;
    overrideMaxSelections?: number;
    overrideInstructionMode?: string;
    promptOrder?: number;
  };
}

interface BulkAssignResult {
  assignedCount: number;
  skippedCount: number;
}

export function useBulkModifierAssignment() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assign = useCallback(async (input: BulkAssignInput): Promise<BulkAssignResult> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ data: BulkAssignResult }>(
        '/api/v1/catalog/modifier-groups/bulk-assign',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bulk assignment failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { assign, isLoading, error };
}
