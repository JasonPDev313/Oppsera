import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListOpenPreauthsInput } from '../validation';

export interface OpenPreauthItem {
  id: string;
  tabId: string;
  status: string;
  authAmountCents: number;
  cardLast4: string;
  cardBrand: string | null;
  authorizedAt: string;
  expiresAt: string | null;
}

export async function listOpenPreauths(
  input: ListOpenPreauthsInput,
): Promise<OpenPreauthItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`p.tenant_id = ${input.tenantId}`,
      sql`p.status = ${input.status}`,
    ];

    if (input.locationId) {
      conditions.push(sql`t.location_id = ${input.locationId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT p.id, p.tab_id, p.status, p.auth_amount_cents,
                 p.card_last4, p.card_brand, p.authorized_at, p.expires_at
          FROM fnb_tab_preauths p
          JOIN fnb_tabs t ON t.id = p.tab_id AND t.tenant_id = p.tenant_id
          WHERE ${whereClause}
          ORDER BY p.authorized_at ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      tabId: r.tab_id as string,
      status: r.status as string,
      authAmountCents: Number(r.auth_amount_cents),
      cardLast4: r.card_last4 as string,
      cardBrand: (r.card_brand as string) ?? null,
      authorizedAt: (r.authorized_at as Date).toISOString(),
      expiresAt: r.expires_at ? (r.expires_at as Date).toISOString() : null,
    }));
  });
}
