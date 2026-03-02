import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListManagerOverridesInput } from '../validation';

export interface ManagerOverrideItem {
  id: string;
  locationId: string;
  initiatorUserId: string;
  initiatorName: string | null;
  approverUserId: string;
  approverName: string | null;
  actionType: string;
  tabIds: string[];
  reasonCode: string | null;
  reasonText: string | null;
  metadata: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  createdAt: string;
}

export interface ManagerOverrideListResult {
  items: ManagerOverrideItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listManagerOverrides(
  input: ListManagerOverridesInput,
): Promise<ManagerOverrideListResult> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [];

    if (input.locationId) {
      conditions.push(sql`mo.location_id = ${input.locationId}`);
    }

    if (input.actionType) {
      conditions.push(sql`mo.action_type = ${input.actionType}`);
    }

    if (input.startDate) {
      conditions.push(sql`mo.created_at >= ${input.startDate}`);
    }

    if (input.endDate) {
      conditions.push(sql`mo.created_at <= ${input.endDate}`);
    }

    if (input.cursor) {
      conditions.push(sql`mo.id < ${input.cursor}`);
    }

    const whereClause = conditions.length > 0
      ? sql`AND ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const limit = input.limit ?? 50;

    const rows = await (tx as any).execute(sql`
      SELECT
        mo.id,
        mo.location_id,
        mo.initiator_user_id,
        ui.display_name AS initiator_name,
        mo.approver_user_id,
        ua.display_name AS approver_name,
        mo.action_type,
        mo.tab_ids,
        mo.reason_code,
        mo.reason_text,
        mo.metadata,
        mo.result_summary,
        mo.created_at
      FROM fnb_manager_overrides mo
      LEFT JOIN users ui ON ui.id = mo.initiator_user_id
      LEFT JOIN users ua ON ua.id = mo.approver_user_id
      WHERE mo.tenant_id = (select current_setting('app.current_tenant_id', true))
        ${whereClause}
      ORDER BY mo.created_at DESC, mo.id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = (hasMore ? allRows.slice(0, limit) : allRows).map((r) => ({
      id: r.id as string,
      locationId: r.location_id as string,
      initiatorUserId: r.initiator_user_id as string,
      initiatorName: (r.initiator_name as string) ?? null,
      approverUserId: r.approver_user_id as string,
      approverName: (r.approver_name as string) ?? null,
      actionType: r.action_type as string,
      tabIds: (r.tab_ids as string[]) ?? [],
      reasonCode: (r.reason_code as string) ?? null,
      reasonText: (r.reason_text as string) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      resultSummary: (r.result_summary as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
