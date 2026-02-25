import { setCustomerWriteApi } from '@oppsera/core/helpers/customer-write-api';
import type { CustomerWriteApi, EnsureCustomerResult } from '@oppsera/core/helpers/customer-write-api';

/**
 * Wire the CustomerWriteApi singleton so PMS and other cross-module
 * code can find-or-create customer records without importing
 * @oppsera/module-customers directly.
 */
export async function initializeCustomerWriteApi(): Promise<void> {
  const { computeDisplayName } = await import('@oppsera/module-customers');
  const { withTenant, customers, customerExternalIds, customerActivityLog } = await import('@oppsera/db');
  const { eq, and } = await import('drizzle-orm');
  const { generateUlid } = await import('@oppsera/shared');

  const api: CustomerWriteApi = {
    async ensureCustomer(ctx, input): Promise<EnsureCustomerResult | null> {
      try {
        return await withTenant(ctx.tenantId, async (tx) => {
          let customerId: string | null = null;

          // 1. Try to find existing customer by email
          const normalizedEmail = input.email?.toLowerCase().trim() || null;
          if (normalizedEmail) {
            const rows = await tx
              .select({ id: customers.id })
              .from(customers)
              .where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.email, normalizedEmail)))
              .limit(1);
            if (rows.length > 0) customerId = rows[0]!.id;
          }

          // 2. Try to find existing by phone (if no email match)
          if (!customerId && input.phone) {
            const rows = await tx
              .select({ id: customers.id })
              .from(customers)
              .where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.phone, input.phone)))
              .limit(1);
            if (rows.length > 0) customerId = rows[0]!.id;
          }

          // 3. Check external ID link (already linked from a previous call?)
          if (!customerId && input.externalLink) {
            const rows = await tx
              .select({ customerId: customerExternalIds.customerId })
              .from(customerExternalIds)
              .where(
                and(
                  eq(customerExternalIds.tenantId, ctx.tenantId),
                  eq(customerExternalIds.provider, input.externalLink.provider),
                  eq(customerExternalIds.externalId, input.externalLink.externalId),
                ),
              )
              .limit(1);
            if (rows.length > 0) customerId = rows[0]!.customerId;
          }

          // If we found an existing customer, ensure external link exists and return
          if (customerId) {
            if (input.externalLink) {
              // Idempotent: ON CONFLICT DO NOTHING via try/catch on unique index
              try {
                await tx.insert(customerExternalIds).values({
                  id: generateUlid(),
                  tenantId: ctx.tenantId,
                  customerId,
                  provider: input.externalLink.provider,
                  externalId: input.externalLink.externalId,
                  metadata: input.externalLink.metadata ?? null,
                });
              } catch {
                // Unique constraint violation = already linked, which is fine
              }
            }
            return { customerId, created: false };
          }

          // 4. Create new customer
          const displayName = computeDisplayName({
            type: 'person',
            firstName: input.firstName,
            lastName: input.lastName,
            email: normalizedEmail,
            phone: input.phone,
          });
          customerId = generateUlid();

          await tx.insert(customers).values({
            id: customerId,
            tenantId: ctx.tenantId,
            type: 'person',
            firstName: input.firstName ?? null,
            lastName: input.lastName ?? null,
            email: normalizedEmail,
            phone: input.phone ?? null,
            displayName,
            acquisitionSource: input.acquisitionSource ?? 'pms',
            createdBy: ctx.user.id,
          });

          // Activity log
          await tx.insert(customerActivityLog).values({
            tenantId: ctx.tenantId,
            customerId,
            activityType: 'system',
            title: 'Customer auto-created from PMS guest',
            createdBy: ctx.user.id,
          });

          // External ID link
          if (input.externalLink) {
            await tx.insert(customerExternalIds).values({
              id: generateUlid(),
              tenantId: ctx.tenantId,
              customerId,
              provider: input.externalLink.provider,
              externalId: input.externalLink.externalId,
              metadata: input.externalLink.metadata ?? null,
            });
          }

          return { customerId, created: true };
        });
      } catch (err) {
        console.error('[CustomerWriteApi] ensureCustomer failed:', err);
        return null;
      }
    },
  };

  setCustomerWriteApi(api);
}
