import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetMySectionFilterInput } from '../validation';

export interface MySectionResult {
  tableIds: string[];
}

export async function getMySection(
  input: GetMySectionFilterInput,
): Promise<MySectionResult> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT table_id
      FROM fnb_my_section_tables
      WHERE tenant_id = ${input.tenantId}
        AND server_user_id = ${input.serverUserId}
        AND room_id = ${input.roomId}
        AND business_date = ${input.businessDate}
    `);

    const tableIds = Array.from(rows as Iterable<Record<string, unknown>>).map(
      (r) => String(r.table_id),
    );

    return { tableIds };
  });
}
