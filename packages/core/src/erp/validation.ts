import { z } from 'zod';
import type { BusinessTier } from '@oppsera/shared';

export const updateWorkflowConfigSchema = z.object({
  moduleKey: z.string().min(1),
  workflowKey: z.string().min(1),
  autoMode: z.boolean().optional(),
  approvalRequired: z.boolean().optional(),
  userVisible: z.boolean().optional(),
  customSettings: z.record(z.unknown()).optional(),
  reason: z.string().optional(),
});

export const changeTierSchema = z.object({
  newTier: z.enum(['SMB', 'MID_MARKET', 'ENTERPRISE']),
  reason: z.string().min(1, 'A reason is required for tier changes'),
});

export const evaluateTierSchema = z.object({
  /** When true, applies the recommended tier automatically */
  apply: z.boolean().default(false),
});

export const runCloseOrchestratorSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  locationId: z.string().optional(),
});

export interface TierTransitionResult {
  allowed: boolean;
  warnings: string[];
  dataPreservation: string;
}

/**
 * Pure function — checks if a tier transition is safe.
 * All transitions are allowed (data is never lost), but some produce warnings.
 */
export function validateTierTransition(
  currentTier: BusinessTier,
  newTier: BusinessTier,
): TierTransitionResult {
  if (currentTier === newTier) {
    return { allowed: true, warnings: [], dataPreservation: 'No change' };
  }

  const warnings: string[] = [];
  const tierOrder: Record<BusinessTier, number> = { SMB: 0, MID_MARKET: 1, ENTERPRISE: 2 };
  const isDowngrade = tierOrder[newTier] < tierOrder[currentTier];

  if (isDowngrade && currentTier === 'ENTERPRISE') {
    warnings.push(
      'Downgrading from Enterprise will hide accounting navigation items and set workflows to automatic mode. Existing data is preserved — upgrading later restores full visibility.',
    );
  }

  if (isDowngrade && currentTier === 'MID_MARKET') {
    warnings.push(
      'Downgrading to SMB will hide accounting navigation items. All data is preserved.',
    );
  }

  return {
    allowed: true,
    warnings,
    dataPreservation: 'All GL data, journal entries, and configurations are preserved. Only visibility and automation defaults change.',
  };
}
