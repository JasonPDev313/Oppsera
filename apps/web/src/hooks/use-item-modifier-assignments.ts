'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface ItemModifierAssignment {
  modifierGroupId: string;
  groupName: string;
  selectionType: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  instructionMode: string;
  defaultBehavior: string;
  overrideRequired: boolean | null;
  overrideMinSelections: number | null;
  overrideMaxSelections: number | null;
  overrideInstructionMode: string | null;
  promptOrder: number;
  modifiers: Array<{
    id: string;
    name: string;
    priceAdjustment: string;
    extraPriceDelta: string | null;
    kitchenLabel: string | null;
    isDefaultOption: boolean;
    sortOrder: number;
    isActive: boolean;
  }>;
}

export function useItemModifierAssignments(itemId: string) {
  const queryClient = useQueryClient();

  const result = useQuery({
    queryKey: ['item-modifier-assignments', itemId],
    queryFn: () =>
      apiFetch<{ data: ItemModifierAssignment[] }>(
        `/api/v1/catalog/items/${itemId}/modifier-assignments`,
      ).then((r) => r.data),
    enabled: !!itemId,
  });

  const mutate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ['item-modifier-assignments', itemId] });
  }, [queryClient, itemId]);

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate,
  };
}

export function useItemModifierAssignmentMutations(itemId: string) {
  const [isLoading, setIsLoading] = useState(false);

  const updateAssignment = useCallback(
    async (
      groupId: string,
      overrides: {
        overrideRequired?: boolean | null;
        overrideMinSelections?: number | null;
        overrideMaxSelections?: number | null;
        overrideInstructionMode?: string | null;
        promptOrder?: number;
      },
    ) => {
      setIsLoading(true);
      try {
        await apiFetch(`/api/v1/catalog/items/${itemId}/modifier-assignments/${groupId}`, {
          method: 'PATCH',
          body: JSON.stringify(overrides),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [itemId],
  );

  const removeAssignment = useCallback(
    async (groupId: string) => {
      setIsLoading(true);
      try {
        await apiFetch(`/api/v1/catalog/items/${itemId}/modifier-assignments/${groupId}`, {
          method: 'DELETE',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [itemId],
  );

  const addAssignment = useCallback(
    async (groupId: string, overrides?: Record<string, unknown>) => {
      setIsLoading(true);
      try {
        await apiFetch('/api/v1/catalog/modifier-groups/bulk-assign', {
          method: 'POST',
          body: JSON.stringify({
            itemIds: [itemId],
            modifierGroupIds: [groupId],
            mode: 'merge',
            overrides,
          }),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [itemId],
  );

  return { updateAssignment, removeAssignment, addAssignment, isLoading };
}
