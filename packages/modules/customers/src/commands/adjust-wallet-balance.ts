import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { customers, customerWalletAccounts, customerActivityLog } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
import type { AdjustWalletBalanceInput } from '../validation';

export async function adjustWalletBalance(ctx: RequestContext, input: AdjustWalletBalanceInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find wallet by walletAccountId + tenantId
    const [wallet] = await (tx as any).select().from(customerWalletAccounts)
      .where(and(eq(customerWalletAccounts.id, input.walletAccountId), eq(customerWalletAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!wallet) throw new NotFoundError('Wallet account', input.walletAccountId);

    // Validate wallet is active
    if (wallet.status !== 'active') {
      throw new ValidationError('Cannot adjust balance on a non-active wallet');
    }

    // Compute new balance
    const newBalanceCents = Number(wallet.balanceCents) + input.amountCents;
    if (newBalanceCents < 0) {
      throw new ValidationError('Insufficient wallet balance');
    }

    // Update wallet balanceCents
    const [updated] = await (tx as any).update(customerWalletAccounts).set({
      balanceCents: newBalanceCents,
      updatedAt: new Date(),
    }).where(eq(customerWalletAccounts.id, input.walletAccountId)).returning();

    // Recompute customers.walletBalanceCents as SUM of all active wallet balances for this customer
    const [sumResult] = await (tx as any).select({
      total: sql<number>`coalesce(sum(${customerWalletAccounts.balanceCents}), 0)`,
    }).from(customerWalletAccounts)
      .where(and(
        eq(customerWalletAccounts.tenantId, ctx.tenantId),
        eq(customerWalletAccounts.customerId, wallet.customerId),
        eq(customerWalletAccounts.status, 'active'),
      ));

    const customerWalletBalanceCents = Number(sumResult.total);
    const customerUpdates: Record<string, unknown> = {
      walletBalanceCents: customerWalletBalanceCents,
      updatedAt: new Date(),
    };

    // If loyalty_points, also update loyaltyPointsBalance
    if (wallet.walletType === 'loyalty_points') {
      const [loyaltySum] = await (tx as any).select({
        total: sql<number>`coalesce(sum(${customerWalletAccounts.balanceCents}), 0)`,
      }).from(customerWalletAccounts)
        .where(and(
          eq(customerWalletAccounts.tenantId, ctx.tenantId),
          eq(customerWalletAccounts.customerId, wallet.customerId),
          eq(customerWalletAccounts.walletType, 'loyalty_points'),
          eq(customerWalletAccounts.status, 'active'),
        ));
      customerUpdates.loyaltyPointsBalance = Number(loyaltySum.total);
    }

    await (tx as any).update(customers).set(customerUpdates)
      .where(eq(customers.id, wallet.customerId));

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: wallet.customerId,
      activityType: 'system',
      title: `Wallet adjusted: ${input.amountCents > 0 ? '+' : ''}${input.amountCents} cents`,
      metadata: { walletAccountId: wallet.id, walletType: wallet.walletType, amountCents: input.amountCents, newBalanceCents, reason: input.reason },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_wallet.adjusted.v1', {
      customerId: wallet.customerId,
      walletAccountId: wallet.id,
      walletType: wallet.walletType,
      amountCents: input.amountCents,
      newBalanceCents,
      customerWalletBalanceCents,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.wallet_adjusted', 'wallet_account', input.walletAccountId);
  return result;
}
