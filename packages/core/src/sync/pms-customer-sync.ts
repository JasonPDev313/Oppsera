/**
 * PMS Guest → Customer Auto-Sync Consumer
 *
 * Consumes `pms.guest.created.v1` events and:
 * 1. Creates (or finds) a matching customer record
 * 2. Links via customerExternalIds (provider='pms')
 * 3. Back-links customerId on the PMS guest
 * 4. Applies the "Hotel Guest" system tag
 *
 * Lives in @oppsera/core (cross-module sync layer) because it
 * orchestrates writes across PMS and Customer tables.
 */
import { z } from 'zod';
import { eq, and, isNull, sql } from 'drizzle-orm';
import {
  withTenant,
  customers,
  customerExternalIds,
  tags,
  customerTags,
  tagAuditLog,
  pmsGuests,
} from '@oppsera/db';
import type { Database } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { logger } from '../observability';

export const HOTEL_GUEST_TAG_SLUG = 'hotel-guest';

const PmsGuestCreatedSchema = z.object({
  guestId: z.string().min(1),
  propertyId: z.string().min(1),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  isVip: z.boolean(),
});

type PmsGuestCreatedData = z.infer<typeof PmsGuestCreatedSchema>;

export async function handlePmsGuestCreated(event: EventEnvelope): Promise<void> {
  const parsed = PmsGuestCreatedSchema.safeParse(event.data);
  if (!parsed.success) {
    logger.error('[pms-customer-sync] Invalid event data', {
      tenantId: event.tenantId,
      eventId: event.eventId,
      error: { message: parsed.error.message },
    });
    return; // Drop malformed events — retrying won't fix bad data
  }

  const data: PmsGuestCreatedData = parsed.data;
  const tenantId = event.tenantId;

  await withTenant(tenantId, async (tx: Database) => {
    // ── 1. Idempotency: check if already linked via external ID ──────
    const existingLinks = await tx
      .select({ id: customerExternalIds.id, customerId: customerExternalIds.customerId })
      .from(customerExternalIds)
      .where(
        and(
          eq(customerExternalIds.tenantId, tenantId),
          eq(customerExternalIds.provider, 'pms'),
          eq(customerExternalIds.externalId, data.guestId),
        ),
      )
      .limit(1);

    if (existingLinks.length > 0) {
      logger.debug('[pms-customer-sync] Already linked, skipping', {
        tenantId,
        eventId: event.eventId,
      });
      return;
    }

    // ── 2. Try to find existing customer by email ────────────────────
    let customerId: string | null = null;
    const normalizedEmail = data.email ? data.email.toLowerCase().trim() : null;

    if (normalizedEmail) {
      const existingByEmail = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, tenantId),
            eq(customers.email, normalizedEmail),
          ),
        )
        .limit(1);

      if (existingByEmail.length > 0) {
        customerId = existingByEmail[0]!.id;
        logger.info('[pms-customer-sync] Matched existing customer by email', {
          tenantId,
          customerId,
          eventId: event.eventId,
        });
      }
    }

    // ── 3. Create customer if not found ──────────────────────────────
    if (!customerId) {
      const displayName = [data.firstName, data.lastName].filter(Boolean).join(' ') || 'Guest';
      customerId = generateUlid();

      await tx.insert(customers).values({
        id: customerId,
        tenantId,
        type: 'person',
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        email: normalizedEmail,
        phone: data.phone ?? null,
        displayName,
        acquisitionSource: 'pms',
        createdBy: 'system',
      });

      logger.info('[pms-customer-sync] Created new customer from PMS guest', {
        tenantId,
        customerId,
        eventId: event.eventId,
      });
    }

    // ── 4. Link via customerExternalIds ──────────────────────────────
    await tx.insert(customerExternalIds).values({
      id: generateUlid(),
      tenantId,
      customerId,
      provider: 'pms',
      externalId: data.guestId,
      metadata: { propertyId: data.propertyId, isVip: data.isVip },
    });

    // ── 5. Back-link customerId on pms_guests ────────────────────────
    await tx
      .update(pmsGuests)
      .set({ customerId, updatedAt: new Date() })
      .where(
        and(
          eq(pmsGuests.id, data.guestId),
          eq(pmsGuests.tenantId, tenantId),
        ),
      );

    // ── 6. Apply "Hotel Guest" tag ───────────────────────────────────
    await applyHotelGuestTag(tx, tenantId, customerId, data.guestId, data.propertyId, event.eventId);
  });
}

async function applyHotelGuestTag(
  tx: Database,
  tenantId: string,
  customerId: string,
  guestId: string,
  propertyId: string,
  eventId: string,
): Promise<void> {
  const tagRows = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(
      and(
        eq(tags.tenantId, tenantId),
        eq(tags.slug, HOTEL_GUEST_TAG_SLUG),
        isNull(tags.archivedAt),
      ),
    )
    .limit(1);

  if (tagRows.length === 0) {
    logger.debug('[pms-customer-sync] Hotel Guest tag not provisioned, skipping', { tenantId });
    return;
  }

  const tagId = tagRows[0]!.id;

  // Check if tag already applied (idempotent for email-matched customers)
  const existingTagAssignment = await tx
    .select({ id: customerTags.id })
    .from(customerTags)
    .where(
      and(
        eq(customerTags.tenantId, tenantId),
        eq(customerTags.customerId, customerId),
        eq(customerTags.tagId, tagId),
        isNull(customerTags.removedAt),
      ),
    )
    .limit(1);

  if (existingTagAssignment.length > 0) {
    return;
  }

  await tx.insert(customerTags).values({
    id: generateUlid(),
    tenantId,
    customerId,
    tagId,
    source: 'system',
    appliedBy: 'system',
  });

  // Increment tag customerCount
  await tx
    .update(tags)
    .set({
      customerCount: sql`${tags.customerCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tags.id, tagId));

  // Tag audit log entry
  await tx.insert(tagAuditLog).values({
    id: generateUlid(),
    tenantId,
    customerId,
    tagId,
    action: 'applied',
    source: 'system',
    actorId: 'system',
    evidence: { trigger: 'pms.guest.created.v1', guestId, propertyId },
  });

  logger.info('[pms-customer-sync] Applied Hotel Guest tag', {
    tenantId,
    customerId,
    eventId,
  });
}
