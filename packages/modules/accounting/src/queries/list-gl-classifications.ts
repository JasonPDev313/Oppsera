import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GlClassificationListItem {
  id: string;
  name: string;
  accountType: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export async function listGlClassifications(input: {
  tenantId: string;
}): Promise<GlClassificationListItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, name, account_type, sort_order, created_at, updated_at
      FROM gl_classifications
      WHERE tenant_id = ${input.tenantId}
      ORDER BY sort_order, name
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      accountType: String(row.account_type),
      sortOrder: Number(row.sort_order),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  });
}
