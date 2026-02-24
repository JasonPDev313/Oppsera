/**
 * PMS Guest → Customer Auto-Sync Consumer
 *
 * Consumes `pms.guest.created.v1` events and:
 * 1. Creates (or finds) a matching customer record
 * 2. Links via customerExternalIds (provider='pms')
 * 3. Back-links customerId on the PMS guest
 * 4. Applies the "Hotel Guest" system tag
 *
 * Lives at the web app orchestration layer because it touches
 * both the PMS and Customer module tables.
 */
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
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';

export const HOTEL_GUEST_TAG_SLUG = 'hotel-guest';

interface PmsGuestCreatedData {
  guestId: string;
  propertyId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  isVip: boolean;
}

export async function handlePmsGuestCreated(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as PmsGuestCreatedData;
  const tenantId = event.tenantId;

  await withTenant(tenantId, async (tx) => {
    // ── 1. Idempotency: check if already linked via external ID ──────
    const existingLinks = await (tx as any)
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
      return; // Already processed
    }

    // ── 2. Try to find existing customer by email ────────────────────
    let customerId: string | null = null;
    const normalizedEmail = data.email ? data.email.toLowerCase().trim() : null;

    if (normalizedEmail) {
      const existingByEmail = await (tx as any)
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
        customerId = existingByEmail[0].id;
      }
    }

    // ── 3. Create customer if not found ──────────────────────────────
    if (!customerId) {
      const displayName = [data.firstName, data.lastName].filter(Boolean).join(' ') || 'Guest';
      customerId = generateUlid();

      await (tx as any).insert(customers).values({
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
    }

    // ── 4. Link via customerExternalIds ──────────────────────────────
    await (tx as any).insert(customerExternalIds).values({
      id: generateUlid(),
      tenantId,
      customerId,
      provider: 'pms',
      externalId: data.guestId,
      metadata: { propertyId: data.propertyId, isVip: data.isVip },
    });

    // ── 5. Back-link customerId on pms_guests ────────────────────────
    await (tx as any)
      .update(pmsGuests)
      .set({ customerId, updatedAt: new Date() })
      .where(
        and(
          eq(pmsGuests.id, data.guestId),
          eq(pmsGuests.tenantId, tenantId),
        ),
      );

    // ── 6. Apply "Hotel Guest" tag ───────────────────────────────────
    const tagRows = await (tx as any)
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
      return; // Tag not provisioned — skip gracefully
    }

    const tagId = tagRows[0].id;

    // Check if tag already applied (idempotent for email-matched customers)
    const existingTagAssignment = await (tx as any)
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
      return; // Tag already applied
    }

    await (tx as any).insert(customerTags).values({
      id: generateUlid(),
      tenantId,
      customerId,
      tagId,
      source: 'system',
      appliedBy: 'system',
    });

    // Increment tag customerCount
    await (tx as any)
      .update(tags)
      .set({
        customerCount: sql`${tags.customerCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, tagId));

    // Tag audit log entry
    await (tx as any).insert(tagAuditLog).values({
      id: generateUlid(),
      tenantId,
      customerId,
      tagId,
      action: 'applied',
      source: 'system',
      actorId: 'system',
      evidence: { trigger: 'pms.guest.created.v1', guestId: data.guestId, propertyId: data.propertyId },
    });
  });
}
