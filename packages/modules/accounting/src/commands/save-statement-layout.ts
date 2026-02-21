import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { financialStatementLayouts } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { SaveStatementLayoutInput } from '../validation';

export async function saveStatementLayout(
  ctx: RequestContext,
  input: SaveStatementLayoutInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const now = new Date();

    // If setting as default, clear other defaults for this type
    if (input.isDefault) {
      await tx
        .update(financialStatementLayouts)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(
            eq(financialStatementLayouts.tenantId, ctx.tenantId),
            eq(financialStatementLayouts.statementType, input.statementType),
            eq(financialStatementLayouts.isDefault, true),
          ),
        );
    }

    if (input.id) {
      // Update existing
      const [updated] = await tx
        .update(financialStatementLayouts)
        .set({
          name: input.name,
          sections: input.sections,
          isDefault: input.isDefault ?? false,
          updatedAt: now,
        })
        .where(
          and(
            eq(financialStatementLayouts.id, input.id),
            eq(financialStatementLayouts.tenantId, ctx.tenantId),
          ),
        )
        .returning();

      return { result: updated!, events: [] };
    }

    // Create new
    const [created] = await tx
      .insert(financialStatementLayouts)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        statementType: input.statementType,
        name: input.name,
        sections: input.sections,
        isDefault: input.isDefault ?? false,
      })
      .returning();

    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'accounting.statement_layout.saved', 'financial_statement_layout', result.id);
  return result;
}
