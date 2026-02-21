import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListTipDeclarationsInput } from '../validation';

export interface TipDeclarationItem {
  id: string;
  serverUserId: string;
  businessDate: string;
  cashTipsDeclaredCents: number;
  cashSalesCents: number;
  declarationPercentage: string | null;
  meetsMinimumThreshold: boolean;
  declaredAt: string;
}

export async function listTipDeclarations(
  input: ListTipDeclarationsInput,
): Promise<TipDeclarationItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`business_date = ${input.businessDate}`,
    ];

    if (input.serverUserId) {
      conditions.push(sql`server_user_id = ${input.serverUserId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, server_user_id, business_date, cash_tips_declared_cents,
                 cash_sales_cents, declaration_percentage, meets_minimum_threshold,
                 declared_at
          FROM fnb_tip_declarations
          WHERE ${whereClause}
          ORDER BY declared_at DESC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      serverUserId: r.server_user_id as string,
      businessDate: r.business_date as string,
      cashTipsDeclaredCents: Number(r.cash_tips_declared_cents),
      cashSalesCents: Number(r.cash_sales_cents),
      declarationPercentage: (r.declaration_percentage as string) ?? null,
      meetsMinimumThreshold: r.meets_minimum_threshold as boolean,
      declaredAt: (r.declared_at as Date).toISOString(),
    }));
  });
}
