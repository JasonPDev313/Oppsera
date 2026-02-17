import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerPreferences, customerServiceFlags, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { SetCustomerPreferenceInput } from '../validation';

export async function setCustomerPreference(ctx: RequestContext, input: SetCustomerPreferenceInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Upsert: check if preference already exists
    const [existing] = await (tx as any).select({ id: customerPreferences.id }).from(customerPreferences)
      .where(and(
        eq(customerPreferences.tenantId, ctx.tenantId),
        eq(customerPreferences.customerId, input.customerId),
        eq(customerPreferences.category, input.category),
        eq(customerPreferences.key, input.key),
      ))
      .limit(1);

    let upserted;
    if (existing) {
      // Update existing preference
      const [updated] = await (tx as any).update(customerPreferences).set({
        value: input.value,
        source: input.source ?? 'manual',
        confidence: input.confidence ?? null,
        updatedAt: new Date(),
        updatedBy: ctx.user.id,
      }).where(eq(customerPreferences.id, existing.id)).returning();
      upserted = updated!;
    } else {
      // Insert new preference
      const [created] = await (tx as any).insert(customerPreferences).values({
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        category: input.category,
        key: input.key,
        value: input.value,
        source: input.source ?? 'manual',
        confidence: input.confidence ?? null,
        updatedBy: ctx.user.id,
      }).returning();
      upserted = created!;
    }

    // If category='dietary', auto-upsert a service flag
    if (input.category === 'dietary') {
      const [existingFlag] = await (tx as any).select({ id: customerServiceFlags.id }).from(customerServiceFlags)
        .where(and(
          eq(customerServiceFlags.tenantId, ctx.tenantId),
          eq(customerServiceFlags.customerId, input.customerId),
          eq(customerServiceFlags.flagType, 'dietary'),
        ))
        .limit(1);

      if (existingFlag) {
        await (tx as any).update(customerServiceFlags).set({
          severity: 'warning',
          notes: `${input.key}: ${input.value}`,
        }).where(eq(customerServiceFlags.id, existingFlag.id));
      } else {
        await (tx as any).insert(customerServiceFlags).values({
          tenantId: ctx.tenantId,
          customerId: input.customerId,
          flagType: 'dietary',
          severity: 'warning',
          notes: `${input.key}: ${input.value}`,
          createdBy: ctx.user.id,
        });
      }
    }

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `Preference set: ${input.category}/${input.key}`,
      metadata: { preferenceId: upserted.id, category: input.category, key: input.key, value: input.value },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_preference.set.v1', {
      customerId: input.customerId,
      preferenceId: upserted.id,
      category: input.category,
      key: input.key,
      value: input.value,
      source: input.source ?? 'manual',
    });

    return { result: upserted, events: [event] };
  });

  await auditLog(ctx, 'customer.preference_set', 'customer', input.customerId);
  return result;
}
