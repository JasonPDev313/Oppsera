import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerWalletAccounts, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateWalletAccountInput } from '../validation';

export async function createWalletAccount(ctx: RequestContext, input: CreateWalletAccountInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select().from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    const [created] = await (tx as any).insert(customerWalletAccounts).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      walletType: input.walletType,
      balanceCents: input.balanceCents ?? 0,
      currency: input.currency ?? 'USD',
      externalRef: input.externalRef ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    }).returning();

    // Update customers.walletBalanceCents: add input.balanceCents to current
    const newWalletBalance = Number(customer.walletBalanceCents) + (input.balanceCents ?? 0);
    const customerUpdates: Record<string, unknown> = {
      walletBalanceCents: newWalletBalance,
      updatedAt: new Date(),
    };

    // If loyalty_points, also update loyaltyPointsBalance
    if (input.walletType === 'loyalty_points') {
      customerUpdates.loyaltyPointsBalance = Number(customer.loyaltyPointsBalance) + (input.balanceCents ?? 0);
    }

    await (tx as any).update(customers).set(customerUpdates)
      .where(eq(customers.id, input.customerId));

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `Wallet created: ${input.walletType}`,
      metadata: { walletAccountId: created!.id, walletType: input.walletType, balanceCents: input.balanceCents ?? 0 },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_wallet.created.v1', {
      customerId: input.customerId,
      walletAccountId: created!.id,
      walletType: input.walletType,
      balanceCents: input.balanceCents ?? 0,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.wallet_created', 'customer', input.customerId);
  return result;
}
