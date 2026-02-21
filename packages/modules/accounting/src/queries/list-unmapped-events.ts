import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface UnmappedEvent {
  id: string;
  eventType: string;
  sourceModule: string;
  sourceReferenceId: string | null;
  entityType: string;
  entityId: string;
  reason: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

interface ListUnmappedEventsInput {
  tenantId: string;
  eventType?: string;
  resolved?: boolean;
  cursor?: string;
  limit?: number;
}

export async function listUnmappedEvents(
  input: ListUnmappedEventsInput,
): Promise<{ items: UnmappedEvent[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const eventTypeFilter = input.eventType
      ? sql`AND event_type = ${input.eventType}`
      : sql``;

    const resolvedFilter = input.resolved !== undefined
      ? input.resolved
        ? sql`AND resolved_at IS NOT NULL`
        : sql`AND resolved_at IS NULL`
      : sql``;

    const cursorFilter = input.cursor
      ? sql`AND id < ${input.cursor}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        id,
        event_type,
        source_module,
        source_reference_id,
        entity_type,
        entity_id,
        reason,
        resolved_at,
        resolved_by,
        created_at
      FROM gl_unmapped_events
      WHERE tenant_id = ${input.tenantId}
        ${eventTypeFilter}
        ${resolvedFilter}
        ${cursorFilter}
      ORDER BY id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = hasMore ? allRows.slice(0, limit) : allRows;

    const mapped = items.map((row) => ({
      id: String(row.id),
      eventType: String(row.event_type),
      sourceModule: String(row.source_module),
      sourceReferenceId: row.source_reference_id ? String(row.source_reference_id) : null,
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      reason: String(row.reason),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
      createdAt: String(row.created_at),
    }));

    return {
      items: mapped,
      cursor: hasMore ? mapped[mapped.length - 1]!.id : null,
      hasMore,
    };
  });
}
