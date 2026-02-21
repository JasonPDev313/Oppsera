import { eq, and } from 'drizzle-orm';
import { withTenant, financialStatementLayouts } from '@oppsera/db';

export interface StatementLayoutItem {
  id: string;
  statementType: string;
  name: string;
  sections: unknown;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ListStatementLayoutsInput {
  tenantId: string;
  statementType?: string;
}

export async function listStatementLayouts(
  input: ListStatementLayoutsInput,
): Promise<StatementLayoutItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(financialStatementLayouts.tenantId, input.tenantId)];
    if (input.statementType) {
      conditions.push(eq(financialStatementLayouts.statementType, input.statementType));
    }

    const rows = await tx
      .select()
      .from(financialStatementLayouts)
      .where(and(...conditions))
      .orderBy(financialStatementLayouts.name);

    return rows.map((r) => ({
      id: r.id,
      statementType: r.statementType,
      name: r.name,
      sections: r.sections,
      isDefault: r.isDefault,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  });
}
