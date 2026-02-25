import { AppError } from '@oppsera/shared';
import type { RequestContext } from './context';

// ── Impersonation Safety Rules ──────────────────────────────────
// Per Phase 1A spec, impersonating admins are restricted from:
// - Voiding orders over $500
// - Issuing refunds over $500
// - Changing accounting settings
// - Deleting any records
// - Modifying other users' permissions/roles

const MONETARY_LIMIT_CENTS = 50000; // $500

export class ImpersonationRestrictionError extends AppError {
  constructor(message: string) {
    super('IMPERSONATION_RESTRICTED', message, 403);
  }
}

/**
 * Check if the current request is an impersonation session.
 */
export function isImpersonating(ctx: RequestContext): boolean {
  return !!ctx.impersonation;
}

/**
 * Assert that an impersonation session is allowed to perform a void.
 * Throws 403 if the void amount exceeds $500.
 */
export function assertImpersonationCanVoid(ctx: RequestContext, amountCents: number): void {
  if (!ctx.impersonation) return;
  if (amountCents > MONETARY_LIMIT_CENTS) {
    throw new ImpersonationRestrictionError(
      `Impersonation mode: cannot void orders over $${MONETARY_LIMIT_CENTS / 100}. Current amount: $${(amountCents / 100).toFixed(2)}.`,
    );
  }
}

/**
 * Assert that an impersonation session is allowed to issue a refund.
 * Throws 403 if the refund amount exceeds $500.
 */
export function assertImpersonationCanRefund(ctx: RequestContext, amountCents: number): void {
  if (!ctx.impersonation) return;
  if (amountCents > MONETARY_LIMIT_CENTS) {
    throw new ImpersonationRestrictionError(
      `Impersonation mode: cannot issue refunds over $${MONETARY_LIMIT_CENTS / 100}. Current amount: $${(amountCents / 100).toFixed(2)}.`,
    );
  }
}

/**
 * Assert that an impersonation session is allowed to modify accounting settings.
 * Always throws 403 during impersonation.
 */
export function assertImpersonationCanModifyAccounting(ctx: RequestContext): void {
  if (!ctx.impersonation) return;
  throw new ImpersonationRestrictionError(
    'Impersonation mode: cannot modify accounting settings.',
  );
}

/**
 * Assert that an impersonation session is allowed to delete records.
 * Always throws 403 during impersonation.
 */
export function assertImpersonationCanDelete(ctx: RequestContext): void {
  if (!ctx.impersonation) return;
  throw new ImpersonationRestrictionError(
    'Impersonation mode: cannot delete records.',
  );
}

/**
 * Assert that an impersonation session is allowed to modify user permissions/roles.
 * Always throws 403 during impersonation.
 */
export function assertImpersonationCanModifyPermissions(ctx: RequestContext): void {
  if (!ctx.impersonation) return;
  throw new ImpersonationRestrictionError(
    'Impersonation mode: cannot modify user permissions or roles.',
  );
}

/**
 * Generic guard — blocks any action during impersonation.
 * Use for quick one-off restrictions where a specialized function isn't needed.
 */
export function assertNotImpersonating(ctx: RequestContext, action: string): void {
  if (!ctx.impersonation) return;
  throw new ImpersonationRestrictionError(
    `Impersonation mode: ${action} is not allowed.`,
  );
}
