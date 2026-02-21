import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListTipOutEntriesInput } from '../validation';

export interface TipOutEntryItem {
  id: string;
  fromServerUserId: string;
  toEmployeeId: string;
  toRoleName: string | null;
  businessDate: string;
  amountCents: number;
  calculationMethod: string;
  calculationBasis: string | null;
  createdAt: string;
}

export async function listTipOutEntries(
  input: ListTipOutEntriesInput,
): Promise<TipOutEntryItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`business_date = ${input.businessDate}`,
    ];

    if (input.serverUserId) {
      conditions.push(sql`from_server_user_id = ${input.serverUserId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, from_server_user_id, to_employee_id, to_role_name,
                 business_date, amount_cents, calculation_method, calculation_basis,
                 created_at
          FROM fnb_tip_out_entries
          WHERE ${whereClause}
          ORDER BY created_at DESC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      fromServerUserId: r.from_server_user_id as string,
      toEmployeeId: r.to_employee_id as string,
      toRoleName: (r.to_role_name as string) ?? null,
      businessDate: r.business_date as string,
      amountCents: Number(r.amount_cents),
      calculationMethod: r.calculation_method as string,
      calculationBasis: (r.calculation_basis as string) ?? null,
      createdAt: (r.created_at as Date).toISOString(),
    }));
  });
}
