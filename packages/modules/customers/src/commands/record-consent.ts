import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerConsents, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RecordConsentInput } from '../validation';

export async function recordConsent(ctx: RequestContext, input: RecordConsentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Check for existing consent record (unique on tenantId + customerId + consentType)
    const [existing] = await (tx as any).select().from(customerConsents)
      .where(and(
        eq(customerConsents.tenantId, ctx.tenantId),
        eq(customerConsents.customerId, input.customerId),
        eq(customerConsents.consentType, input.consentType),
      ))
      .limit(1);

    let consent;
    if (existing) {
      // Update existing consent
      const updates: Record<string, unknown> = {
        status: input.status,
        source: input.source ?? 'manual',
        ipAddress: input.ipAddress ?? null,
        documentId: input.documentId ?? null,
      };
      if (input.status === 'granted') {
        updates.grantedAt = new Date();
        updates.revokedAt = null;
      } else if (input.status === 'revoked') {
        updates.revokedAt = new Date();
      }

      const [updated] = await (tx as any).update(customerConsents).set(updates)
        .where(eq(customerConsents.id, existing.id)).returning();
      consent = updated!;
    } else {
      // Insert new consent
      const [created] = await (tx as any).insert(customerConsents).values({
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        consentType: input.consentType,
        status: input.status,
        grantedAt: input.status === 'granted' ? new Date() : null,
        revokedAt: input.status === 'revoked' ? new Date() : null,
        source: input.source ?? 'manual',
        ipAddress: input.ipAddress ?? null,
        documentId: input.documentId ?? null,
      }).returning();
      consent = created!;
    }

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `Consent ${input.status}: ${input.consentType}`,
      metadata: { consentId: consent.id, consentType: input.consentType, status: input.status },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_consent.recorded.v1', {
      customerId: input.customerId,
      consentId: consent.id,
      consentType: input.consentType,
      status: input.status,
      source: input.source ?? 'manual',
    });

    return { result: consent, events: [event] };
  });

  await auditLog(ctx, 'customer.consent_recorded', 'customer', input.customerId);
  return result;
}
