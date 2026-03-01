import { eq, and, lte } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant, spaPackageDefinitions, spaPackageBalances, spaPackageRedemptions } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';

// ── Purchase Package ──────────────────────────────────────────────────

interface PurchasePackageInput {
  clientRequestId?: string;
  customerId: string;
  packageDefId: string;
  orderId?: string;
  notes?: string;
}

/**
 * Purchases a spa package for a customer.
 *
 * Validates the package definition exists and is active, calculates the
 * expiration date from validityDays, creates a balance record with the
 * definition's session/credit totals, and emits a PACKAGE_SOLD event.
 */
export async function purchasePackage(ctx: RequestContext, input: PurchasePackageInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'purchasePackage');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Validate package definition exists and is active
    const [packageDef] = await tx
      .select()
      .from(spaPackageDefinitions)
      .where(
        and(
          eq(spaPackageDefinitions.tenantId, ctx.tenantId),
          eq(spaPackageDefinitions.id, input.packageDefId),
        ),
      )
      .limit(1);

    if (!packageDef) {
      throw new AppError('NOT_FOUND', `Package definition not found: ${input.packageDefId}`, 404);
    }
    if (!packageDef.isActive) {
      throw new AppError('VALIDATION_ERROR', 'Package definition is not active', 400);
    }

    // Calculate expiration date
    const today = new Date();
    const purchaseDate = today.toISOString().slice(0, 10);
    const expirationDate = new Date(today);
    expirationDate.setDate(expirationDate.getDate() + packageDef.validityDays);
    const expirationDateStr = expirationDate.toISOString().slice(0, 10);

    // Insert balance record
    const [created] = await tx
      .insert(spaPackageBalances)
      .values({
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        packageDefId: input.packageDefId,
        purchaseDate,
        expirationDate: expirationDateStr,
        sessionsTotal: packageDef.totalSessions ?? null,
        sessionsUsed: 0,
        creditsTotal: packageDef.totalCredits ?? null,
        creditsUsed: '0',
        status: 'active',
        freezeCount: 0,
        orderId: input.orderId ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    // Save idempotency key
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'purchasePackage', created!);

    const event = buildEventFromContext(ctx, SPA_EVENTS.PACKAGE_SOLD, {
      balanceId: created!.id,
      customerId: input.customerId,
      packageDefId: input.packageDefId,
      packageName: packageDef.name,
      packageType: packageDef.packageType,
      sessionsTotal: packageDef.totalSessions,
      creditsTotal: packageDef.totalCredits,
      sellingPriceCents: packageDef.sellingPriceCents,
      purchaseDate,
      expirationDate: expirationDateStr,
      orderId: input.orderId,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'spa.package.sold', 'spa_package_balance', result.id);

  return result;
}

// ── Redeem Package Session ────────────────────────────────────────────

interface RedeemPackageSessionInput {
  clientRequestId?: string;
  balanceId: string;
  appointmentId?: string;
  appointmentItemId?: string;
  sessions?: number;
  credits?: string;
}

/**
 * Redeems sessions or credits from an active package balance.
 *
 * For session-based packages, increments sessionsUsed and validates
 * against sessionsTotal. For credit-based packages, increments
 * creditsUsed and validates against creditsTotal. Creates a redemption
 * record and marks the balance as exhausted when fully consumed.
 */
export async function redeemPackageSession(ctx: RequestContext, input: RedeemPackageSessionInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'redeemPackageSession');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Fetch balance
    const [balance] = await tx
      .select()
      .from(spaPackageBalances)
      .where(
        and(
          eq(spaPackageBalances.tenantId, ctx.tenantId),
          eq(spaPackageBalances.id, input.balanceId),
        ),
      )
      .limit(1);

    if (!balance) {
      throw new AppError('NOT_FOUND', `Package balance not found: ${input.balanceId}`, 404);
    }
    if (balance.status !== 'active') {
      throw new AppError('VALIDATION_ERROR', `Package is not active (status: ${balance.status})`, 400);
    }

    const sessionsToRedeem = input.sessions ?? 1;
    const creditsToRedeem = input.credits ?? '0';

    // Validate session availability
    if (balance.sessionsTotal !== null) {
      const newUsed = balance.sessionsUsed + sessionsToRedeem;
      if (newUsed > balance.sessionsTotal) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Insufficient sessions: ${balance.sessionsTotal - balance.sessionsUsed} remaining, ${sessionsToRedeem} requested`,
          400,
        );
      }
    }

    // Validate credit availability
    if (balance.creditsTotal !== null && Number(creditsToRedeem) > 0) {
      const newUsed = Number(balance.creditsUsed) + Number(creditsToRedeem);
      if (newUsed > Number(balance.creditsTotal)) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Insufficient credits: ${(Number(balance.creditsTotal) - Number(balance.creditsUsed)).toFixed(2)} remaining, ${creditsToRedeem} requested`,
          400,
        );
      }
    }

    // Calculate new usage values
    const newSessionsUsed = balance.sessionsUsed + sessionsToRedeem;
    const newCreditsUsed = (Number(balance.creditsUsed) + Number(creditsToRedeem)).toFixed(2);

    // Determine if package is now exhausted
    const sessionExhausted = balance.sessionsTotal !== null && newSessionsUsed >= balance.sessionsTotal;
    const creditExhausted = balance.creditsTotal !== null && Number(newCreditsUsed) >= Number(balance.creditsTotal);
    const isExhausted = sessionExhausted || creditExhausted;

    // Update balance
    const [updated] = await tx
      .update(spaPackageBalances)
      .set({
        sessionsUsed: newSessionsUsed,
        creditsUsed: newCreditsUsed,
        status: isExhausted ? 'exhausted' : 'active',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaPackageBalances.id, input.balanceId),
          eq(spaPackageBalances.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    // Insert redemption record
    const [redemption] = await tx
      .insert(spaPackageRedemptions)
      .values({
        tenantId: ctx.tenantId,
        balanceId: input.balanceId,
        appointmentId: input.appointmentId ?? null,
        appointmentItemId: input.appointmentItemId ?? null,
        sessionsRedeemed: sessionsToRedeem,
        creditsRedeemed: creditsToRedeem,
        redeemedBy: ctx.user.id,
        voided: false,
      })
      .returning();

    // Save idempotency key
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'redeemPackageSession', redemption!);

    const event = buildEventFromContext(ctx, SPA_EVENTS.PACKAGE_REDEEMED, {
      balanceId: updated!.id,
      redemptionId: redemption!.id,
      customerId: updated!.customerId,
      packageDefId: updated!.packageDefId,
      sessionsRedeemed: sessionsToRedeem,
      creditsRedeemed: creditsToRedeem,
      sessionsRemaining: balance.sessionsTotal !== null ? balance.sessionsTotal - newSessionsUsed : null,
      creditsRemaining: balance.creditsTotal !== null ? (Number(balance.creditsTotal) - Number(newCreditsUsed)).toFixed(2) : null,
      isExhausted,
      appointmentId: input.appointmentId,
      appointmentItemId: input.appointmentItemId,
    });

    return { result: { balance: updated!, redemption: redemption! }, events: [event] };
  });

  await auditLog(ctx, 'spa.package.redeemed', 'spa_package_balance', result.balance.id);

  return result;
}

// ── Void Package Redemption ───────────────────────────────────────────

interface VoidPackageRedemptionInput {
  redemptionId: string;
}

/**
 * Voids a previously recorded package redemption.
 *
 * Marks the redemption as voided and reverses the usage on the
 * associated balance. If the balance was exhausted, restores it
 * to active status.
 */
export async function voidPackageRedemption(ctx: RequestContext, input: VoidPackageRedemptionInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch redemption
    const [redemption] = await tx
      .select()
      .from(spaPackageRedemptions)
      .where(
        and(
          eq(spaPackageRedemptions.tenantId, ctx.tenantId),
          eq(spaPackageRedemptions.id, input.redemptionId),
        ),
      )
      .limit(1);

    if (!redemption) {
      throw new AppError('NOT_FOUND', `Redemption not found: ${input.redemptionId}`, 404);
    }
    if (redemption.voided) {
      throw new AppError('VALIDATION_ERROR', 'Redemption is already voided', 400);
    }

    // Mark redemption as voided
    await tx
      .update(spaPackageRedemptions)
      .set({ voided: true })
      .where(
        and(
          eq(spaPackageRedemptions.id, input.redemptionId),
          eq(spaPackageRedemptions.tenantId, ctx.tenantId),
        ),
      );

    // Fetch the balance to reverse usage
    const [balance] = await tx
      .select()
      .from(spaPackageBalances)
      .where(
        and(
          eq(spaPackageBalances.tenantId, ctx.tenantId),
          eq(spaPackageBalances.id, redemption.balanceId),
        ),
      )
      .limit(1);

    if (!balance) {
      throw new AppError('NOT_FOUND', `Package balance not found: ${redemption.balanceId}`, 404);
    }

    // Reverse the usage
    const newSessionsUsed = Math.max(0, balance.sessionsUsed - redemption.sessionsRedeemed);
    const newCreditsUsed = Math.max(0, Number(balance.creditsUsed) - Number(redemption.creditsRedeemed)).toFixed(2);

    // If balance was exhausted, restore to active
    const newStatus = balance.status === 'exhausted' ? 'active' : balance.status;

    const [updated] = await tx
      .update(spaPackageBalances)
      .set({
        sessionsUsed: newSessionsUsed,
        creditsUsed: newCreditsUsed,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaPackageBalances.id, redemption.balanceId),
          eq(spaPackageBalances.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    return { result: { balance: updated!, redemption: { ...redemption, voided: true } }, events: [] };
  });

  await auditLog(ctx, 'spa.package.redemption_voided', 'spa_package_redemption', input.redemptionId);

  return result;
}

// ── Freeze Package ────────────────────────────────────────────────────

interface FreezePackageInput {
  balanceId: string;
  freezeUntil?: string;
}

/**
 * Freezes an active package balance, pausing its usage and expiration.
 *
 * Validates the package definition allows freezing and that the
 * freeze count has not exceeded maxFreezeDays (used as a max-freeze-count
 * limit). Sets status to frozen with timestamps and increments
 * the freeze counter.
 */
export async function freezePackage(ctx: RequestContext, input: FreezePackageInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch balance
    const [balance] = await tx
      .select()
      .from(spaPackageBalances)
      .where(
        and(
          eq(spaPackageBalances.tenantId, ctx.tenantId),
          eq(spaPackageBalances.id, input.balanceId),
        ),
      )
      .limit(1);

    if (!balance) {
      throw new AppError('NOT_FOUND', `Package balance not found: ${input.balanceId}`, 404);
    }
    if (balance.status !== 'active') {
      throw new AppError('VALIDATION_ERROR', `Package must be active to freeze (status: ${balance.status})`, 400);
    }

    // Fetch package definition to check freeze rules
    const [packageDef] = await tx
      .select({
        freezeAllowed: spaPackageDefinitions.freezeAllowed,
        maxFreezeDays: spaPackageDefinitions.maxFreezeDays,
      })
      .from(spaPackageDefinitions)
      .where(
        and(
          eq(spaPackageDefinitions.tenantId, ctx.tenantId),
          eq(spaPackageDefinitions.id, balance.packageDefId),
        ),
      )
      .limit(1);

    if (!packageDef) {
      throw new AppError('NOT_FOUND', `Package definition not found: ${balance.packageDefId}`, 404);
    }
    if (!packageDef.freezeAllowed) {
      throw new AppError('VALIDATION_ERROR', 'This package does not allow freezing', 400);
    }

    // Check freeze count limit (maxFreezeDays acts as max freeze count)
    if (packageDef.maxFreezeDays !== null && balance.freezeCount >= packageDef.maxFreezeDays) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Maximum freeze count reached (${packageDef.maxFreezeDays})`,
        400,
      );
    }

    const now = new Date();

    const [updated] = await tx
      .update(spaPackageBalances)
      .set({
        status: 'frozen',
        frozenAt: now,
        frozenUntil: input.freezeUntil ? new Date(input.freezeUntil) : null,
        freezeCount: balance.freezeCount + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(spaPackageBalances.id, input.balanceId),
          eq(spaPackageBalances.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'spa.package.frozen', 'spa_package_balance', result.id);

  return result;
}

// ── Unfreeze Package ──────────────────────────────────────────────────

interface UnfreezePackageInput {
  balanceId: string;
}

/**
 * Unfreezes a frozen package balance, restoring it to active status.
 *
 * Clears frozenAt and frozenUntil timestamps and sets status back
 * to active.
 */
export async function unfreezePackage(ctx: RequestContext, input: UnfreezePackageInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch balance
    const [balance] = await tx
      .select()
      .from(spaPackageBalances)
      .where(
        and(
          eq(spaPackageBalances.tenantId, ctx.tenantId),
          eq(spaPackageBalances.id, input.balanceId),
        ),
      )
      .limit(1);

    if (!balance) {
      throw new AppError('NOT_FOUND', `Package balance not found: ${input.balanceId}`, 404);
    }
    if (balance.status !== 'frozen') {
      throw new AppError('VALIDATION_ERROR', `Package must be frozen to unfreeze (status: ${balance.status})`, 400);
    }

    const [updated] = await tx
      .update(spaPackageBalances)
      .set({
        status: 'active',
        frozenAt: null,
        frozenUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaPackageBalances.id, input.balanceId),
          eq(spaPackageBalances.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'spa.package.unfrozen', 'spa_package_balance', result.id);

  return result;
}

// ── Transfer Package ──────────────────────────────────────────────────

interface TransferPackageInput {
  balanceId: string;
  toCustomerId: string;
}

/**
 * Transfers an active package balance to a different customer.
 *
 * Validates the package definition allows transfers (isTransferable)
 * and that the balance is in active status before reassigning
 * the customerId.
 */
export async function transferPackage(ctx: RequestContext, input: TransferPackageInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch balance
    const [balance] = await tx
      .select()
      .from(spaPackageBalances)
      .where(
        and(
          eq(spaPackageBalances.tenantId, ctx.tenantId),
          eq(spaPackageBalances.id, input.balanceId),
        ),
      )
      .limit(1);

    if (!balance) {
      throw new AppError('NOT_FOUND', `Package balance not found: ${input.balanceId}`, 404);
    }
    if (balance.status !== 'active') {
      throw new AppError('VALIDATION_ERROR', `Package must be active to transfer (status: ${balance.status})`, 400);
    }

    // Fetch package definition to check transferability
    const [packageDef] = await tx
      .select({ isTransferable: spaPackageDefinitions.isTransferable })
      .from(spaPackageDefinitions)
      .where(
        and(
          eq(spaPackageDefinitions.tenantId, ctx.tenantId),
          eq(spaPackageDefinitions.id, balance.packageDefId),
        ),
      )
      .limit(1);

    if (!packageDef) {
      throw new AppError('NOT_FOUND', `Package definition not found: ${balance.packageDefId}`, 404);
    }
    if (!packageDef.isTransferable) {
      throw new AppError('VALIDATION_ERROR', 'This package is not transferable', 400);
    }

    const fromCustomerId = balance.customerId;

    const [updated] = await tx
      .update(spaPackageBalances)
      .set({
        customerId: input.toCustomerId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaPackageBalances.id, input.balanceId),
          eq(spaPackageBalances.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    return { result: { ...updated!, fromCustomerId }, events: [] };
  });

  await auditLog(ctx, 'spa.package.transferred', 'spa_package_balance', result.id);

  return result;
}

// ── Expire Packages (Batch) ───────────────────────────────────────────

/**
 * Batch-expires all active packages whose expirationDate has passed.
 *
 * This is a maintenance operation typically run on a schedule.
 * Uses withTenant for a lightweight transaction without event publishing.
 * Returns the count of expired packages.
 */
export async function expirePackages(ctx: RequestContext, input: { date?: string }) {
  const targetDate = input.date ?? new Date().toISOString().slice(0, 10);

  return withTenant(ctx.tenantId, async (tx) => {
    const expired = await tx
      .update(spaPackageBalances)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(spaPackageBalances.tenantId, ctx.tenantId),
          eq(spaPackageBalances.status, 'active'),
          lte(spaPackageBalances.expirationDate, targetDate),
        ),
      )
      .returning({ id: spaPackageBalances.id });

    return { expiredCount: expired.length };
  });
}
