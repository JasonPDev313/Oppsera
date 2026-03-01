import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const packageSoldSchema = z.object({
  packageId: z.string(),
  customerId: z.string(),
  businessDate: z.string(),
  locationId: z.string(),
  priceCents: z.number().optional(),
});

const packageRedeemedSchema = z.object({
  packageId: z.string(),
  customerId: z.string(),
  businessDate: z.string(),
  locationId: z.string(),
  serviceId: z.string().optional(),
  appointmentId: z.string().optional(),
});

const CONSUMER_NAME_SOLD = 'spa.packageSold';
const CONSUMER_NAME_REDEEMED = 'spa.packageRedeemed';

/**
 * Handles spa.package.sold.v1 events.
 *
 * Atomically (single transaction):
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency guard)
 * 3. Upsert rm_spa_client_metrics — increment package_purchases
 */
export async function handleSpaPackageSold(event: EventEnvelope): Promise<void> {
  const parsed = packageSoldSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME_SOLD}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return;
  }
  const data = parsed.data;

  await withTenant(event.tenantId, async (tx) => {
    // Step 1: Atomic idempotency check
    const inserted = await (tx as any).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME_SOLD}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted as Iterable<{ id: string }>);
    if (rows.length === 0) return;

    const businessDate = data.businessDate;

    // Step 2: Upsert rm_spa_client_metrics — increment package_purchases
    await (tx as any).execute(sql`
      INSERT INTO rm_spa_client_metrics (
        id, tenant_id, customer_id, business_date,
        package_purchases,
        created_at, updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${data.customerId}, ${businessDate},
        ${1},
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id, customer_id, business_date)
      DO UPDATE SET
        package_purchases = rm_spa_client_metrics.package_purchases + 1,
        updated_at = NOW()
    `);
  });
}

/**
 * Handles spa.package.redeemed.v1 events.
 *
 * Atomically (single transaction):
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency guard)
 * 3. Upsert rm_spa_client_metrics — increment package_redemptions
 * 4. Upsert rm_spa_service_metrics — increment package_redemptions (if serviceId present)
 */
export async function handleSpaPackageRedeemed(event: EventEnvelope): Promise<void> {
  const parsed = packageRedeemedSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME_REDEEMED}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return;
  }
  const data = parsed.data;

  await withTenant(event.tenantId, async (tx) => {
    // Step 1: Atomic idempotency check
    const inserted = await (tx as any).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME_REDEEMED}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted as Iterable<{ id: string }>);
    if (rows.length === 0) return;

    const businessDate = data.businessDate;

    // Step 2: Upsert rm_spa_client_metrics — increment package_redemptions
    await (tx as any).execute(sql`
      INSERT INTO rm_spa_client_metrics (
        id, tenant_id, customer_id, business_date,
        package_redemptions,
        created_at, updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${data.customerId}, ${businessDate},
        ${1},
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id, customer_id, business_date)
      DO UPDATE SET
        package_redemptions = rm_spa_client_metrics.package_redemptions + 1,
        updated_at = NOW()
    `);

    // Step 3: Upsert rm_spa_service_metrics — increment package_redemptions (if serviceId present)
    if (data.serviceId) {
      await (tx as any).execute(sql`
        INSERT INTO rm_spa_service_metrics (
          id, tenant_id, service_id, business_date,
          package_redemptions,
          created_at, updated_at
        )
        VALUES (
          ${generateUlid()}, ${event.tenantId}, ${data.serviceId}, ${businessDate},
          ${1},
          NOW(), NOW()
        )
        ON CONFLICT (tenant_id, service_id, business_date)
        DO UPDATE SET
          package_redemptions = rm_spa_service_metrics.package_redemptions + 1,
          updated_at = NOW()
      `);
    }
  });
}
