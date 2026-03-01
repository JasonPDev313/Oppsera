import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaServiceAddons, spaServiceAddonLinks, spaServices } from '@oppsera/db';
import { createAddonSchema, linkAddonToServiceSchema } from '../validation';
import type { CreateAddonInput, LinkAddonToServiceInput } from '../validation';

/**
 * Creates a new service addon.
 */
export async function createServiceAddon(ctx: RequestContext, input: CreateAddonInput) {
  const parsed = createAddonSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate unique name within tenant
    const [existing] = await tx
      .select({ id: spaServiceAddons.id })
      .from(spaServiceAddons)
      .where(
        and(
          eq(spaServiceAddons.tenantId, ctx.tenantId),
          eq(spaServiceAddons.name, parsed.name),
          eq(spaServiceAddons.isActive, true),
        ),
      )
      .limit(1);

    if (existing) {
      throw new AppError('VALIDATION_ERROR', `Addon "${parsed.name}" already exists`, 400);
    }

    const [created] = await tx
      .insert(spaServiceAddons)
      .values({
        tenantId: ctx.tenantId,
        name: parsed.name,
        description: parsed.description ?? null,
        durationMinutes: parsed.durationMinutes,
        price: parsed.price,
        memberPrice: parsed.memberPrice ?? null,
        isStandalone: parsed.isStandalone,
        sortOrder: parsed.sortOrder,
      })
      .returning();

    // Addons are config — no domain events
    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'spa.service_addon.created', 'spa_service_addon', result.id);

  return result;
}

/**
 * Links an addon to a service via the junction table.
 */
export async function linkAddonToService(ctx: RequestContext, input: LinkAddonToServiceInput) {
  const parsed = linkAddonToServiceSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate service exists
    const [service] = await tx
      .select({ id: spaServices.id })
      .from(spaServices)
      .where(
        and(
          eq(spaServices.id, parsed.serviceId),
          eq(spaServices.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!service) {
      throw new AppError('NOT_FOUND', `Service not found: ${parsed.serviceId}`, 404);
    }

    // Validate addon exists
    const [addon] = await tx
      .select({ id: spaServiceAddons.id })
      .from(spaServiceAddons)
      .where(
        and(
          eq(spaServiceAddons.id, parsed.addonId),
          eq(spaServiceAddons.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!addon) {
      throw new AppError('NOT_FOUND', `Addon not found: ${parsed.addonId}`, 404);
    }

    // Check for existing link (idempotent — upsert pattern via ON CONFLICT)
    const [existingLink] = await tx
      .select({ id: spaServiceAddonLinks.id })
      .from(spaServiceAddonLinks)
      .where(
        and(
          eq(spaServiceAddonLinks.tenantId, ctx.tenantId),
          eq(spaServiceAddonLinks.serviceId, parsed.serviceId),
          eq(spaServiceAddonLinks.addonId, parsed.addonId),
        ),
      )
      .limit(1);

    if (existingLink) {
      // Update the existing link instead of duplicating
      const [updated] = await tx
        .update(spaServiceAddonLinks)
        .set({
          isDefault: parsed.isDefault,
          priceOverride: parsed.priceOverride ?? null,
        })
        .where(eq(spaServiceAddonLinks.id, existingLink.id))
        .returning();

      return { result: updated!, events: [] };
    }

    const [created] = await tx
      .insert(spaServiceAddonLinks)
      .values({
        tenantId: ctx.tenantId,
        serviceId: parsed.serviceId,
        addonId: parsed.addonId,
        isDefault: parsed.isDefault,
        priceOverride: parsed.priceOverride ?? null,
      })
      .returning();

    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'spa.service_addon.linked', 'spa_service_addon_link', result.id);

  return result;
}

/**
 * Removes the link between an addon and a service.
 */
export async function unlinkAddonFromService(
  ctx: RequestContext,
  input: { serviceId: string; addonId: string },
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find the link
    const [link] = await tx
      .select()
      .from(spaServiceAddonLinks)
      .where(
        and(
          eq(spaServiceAddonLinks.tenantId, ctx.tenantId),
          eq(spaServiceAddonLinks.serviceId, input.serviceId),
          eq(spaServiceAddonLinks.addonId, input.addonId),
        ),
      )
      .limit(1);

    if (!link) {
      throw new AppError('NOT_FOUND', 'Addon link not found', 404);
    }

    await tx
      .delete(spaServiceAddonLinks)
      .where(eq(spaServiceAddonLinks.id, link.id));

    return { result: link, events: [] };
  });

  await auditLog(ctx, 'spa.service_addon.unlinked', 'spa_service_addon_link', result.id);

  return result;
}
