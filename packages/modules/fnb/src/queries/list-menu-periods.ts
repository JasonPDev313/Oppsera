import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListMenuPeriodsInput } from '../validation';

export interface MenuPeriodItem {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isActive: boolean;
  sortOrder: number;
}

export async function listMenuPeriods(
  input: ListMenuPeriodsInput,
): Promise<MenuPeriodItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`location_id = ${input.locationId}`,
    ];

    if (input.isActive !== undefined) {
      conditions.push(sql`is_active = ${input.isActive}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, name, start_time, end_time, days_of_week,
                 is_active, sort_order
          FROM fnb_menu_periods
          WHERE ${whereClause}
          ORDER BY sort_order ASC, name ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      startTime: r.start_time as string,
      endTime: r.end_time as string,
      daysOfWeek: r.days_of_week as number[],
      isActive: r.is_active as boolean,
      sortOrder: Number(r.sort_order),
    }));
  });
}
