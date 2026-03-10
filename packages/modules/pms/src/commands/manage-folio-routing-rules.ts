/**
 * CRUD for folio routing rules.
 * Routing rules auto-route certain entry types to specific folio labels.
 *
 * Note: These are configuration operations — no event publishing or idempotency
 * keys are used intentionally. Rules are low-frequency admin changes and do not
 * need outbox guarantees. If audit trail is required in the future, wrap in
 * publishWithOutbox and emit a pms.folio_routing_rule.* event.
 */
import { and, eq } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsFolioRoutingRules } from '@oppsera/db';
import { withTenant } from '@oppsera/db';

export async function createFolioRoutingRule(
  ctx: RequestContext,
  input: {
    propertyId: string;
    entryType: string;
    departmentCode?: string;
    targetFolioLabel: string;
    description?: string;
  },
) {
  return withTenant(ctx.tenantId, async (tx) => {
    const id = generateUlid();
    await tx.insert(pmsFolioRoutingRules).values({
      id,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      entryType: input.entryType,
      departmentCode: input.departmentCode ?? null,
      targetFolioLabel: input.targetFolioLabel,
      description: input.description ?? null,
      isActive: true,
    });
    return { id, ...input };
  });
}

export async function updateFolioRoutingRule(
  ctx: RequestContext,
  ruleId: string,
  input: {
    entryType?: string;
    departmentCode?: string | null;
    targetFolioLabel?: string;
    description?: string | null;
    isActive?: boolean;
  },
) {
  return withTenant(ctx.tenantId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsFolioRoutingRules)
      .where(and(eq(pmsFolioRoutingRules.id, ruleId), eq(pmsFolioRoutingRules.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Folio routing rule', ruleId);

    await tx
      .update(pmsFolioRoutingRules)
      .set({
        ...(input.entryType !== undefined && { entryType: input.entryType }),
        ...(input.departmentCode !== undefined && { departmentCode: input.departmentCode }),
        ...(input.targetFolioLabel !== undefined && { targetFolioLabel: input.targetFolioLabel }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        updatedAt: new Date(),
      })
      .where(and(eq(pmsFolioRoutingRules.id, ruleId), eq(pmsFolioRoutingRules.tenantId, ctx.tenantId)));

    return { id: ruleId, ...input };
  });
}

export async function deleteFolioRoutingRule(
  ctx: RequestContext,
  ruleId: string,
) {
  return withTenant(ctx.tenantId, async (tx) => {
    const [existing] = await tx
      .select({ id: pmsFolioRoutingRules.id })
      .from(pmsFolioRoutingRules)
      .where(and(eq(pmsFolioRoutingRules.id, ruleId), eq(pmsFolioRoutingRules.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Folio routing rule', ruleId);

    await tx
      .delete(pmsFolioRoutingRules)
      .where(and(eq(pmsFolioRoutingRules.id, ruleId), eq(pmsFolioRoutingRules.tenantId, ctx.tenantId)));

    return { id: ruleId, deleted: true };
  });
}

export async function listFolioRoutingRules(
  tenantId: string,
  propertyId: string,
) {
  return withTenant(tenantId, async (tx) => {
    return tx
      .select()
      .from(pmsFolioRoutingRules)
      .where(and(
        eq(pmsFolioRoutingRules.tenantId, tenantId),
        eq(pmsFolioRoutingRules.propertyId, propertyId),
      ))
      .orderBy(pmsFolioRoutingRules.entryType);
  });
}
