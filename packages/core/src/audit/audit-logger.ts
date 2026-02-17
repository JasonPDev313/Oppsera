import { sql } from 'drizzle-orm';
import { db, createAdminClient, auditLog as auditLogTable } from '@oppsera/db';
import type { Database } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { AuditEntry, AuditLogger } from './index';

export class DrizzleAuditLogger implements AuditLogger {
  async log(entry: AuditEntry): Promise<void> {
    try {
      const connection = entry.actorType === 'system' || entry.actorType === 'api_key'
        ? createAdminClient()
        : (db as Database);

      await connection.insert(auditLogTable).values({
        id: generateUlid(),
        tenantId: entry.tenantId,
        locationId: entry.locationId ?? null,
        actorUserId: entry.actorUserId ?? null,
        actorType: entry.actorType ?? 'user',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        changes: entry.changes ?? null,
        metadata: entry.metadata ?? null,
      });
    } catch (error) {
      console.error('Failed to write audit log entry:', error);
    }
  }

  async query(
    tenantId: string,
    filters: {
      entityType?: string;
      entityId?: string;
      actorUserId?: string;
      action?: string;
      from?: Date;
      to?: Date;
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ entries: (AuditEntry & { id: string; createdAt: string })[]; cursor?: string }> {
    const limit = Math.min(filters.limit ?? 50, 100);

    // Build parameterized conditions using Drizzle sql template
    const conditions = [sql`tenant_id = ${tenantId}`];

    if (filters.entityType) {
      conditions.push(sql`entity_type = ${filters.entityType}`);
    }
    if (filters.entityId) {
      conditions.push(sql`entity_id = ${filters.entityId}`);
    }
    if (filters.actorUserId) {
      conditions.push(sql`actor_user_id = ${filters.actorUserId}`);
    }
    if (filters.action) {
      conditions.push(sql`action = ${filters.action}`);
    }
    if (filters.from) {
      conditions.push(sql`created_at >= ${filters.from.toISOString()}`);
    }
    if (filters.to) {
      conditions.push(sql`created_at < ${filters.to.toISOString()}`);
    }
    if (filters.cursor) {
      const [cursorTime, cursorId] = filters.cursor.split(':');
      conditions.push(sql`(created_at, id) < (${cursorTime!}, ${cursorId!})`);
    }

    // Join conditions with AND
    const whereClause = conditions.reduce((acc, cond, i) =>
      i === 0 ? cond : sql`${acc} AND ${cond}`
    );

    const rows = await db.execute(
      sql`SELECT id, tenant_id, location_id, actor_user_id, actor_type, action,
              entity_type, entity_id, changes, metadata, created_at
       FROM audit_log
       WHERE ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit + 1}`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = results.length > limit;
    const entries = results.slice(0, limit).map((row) => ({
      id: row.id as string,
      tenantId: row.tenant_id as string,
      locationId: (row.location_id as string) || undefined,
      actorUserId: (row.actor_user_id as string) || undefined,
      actorType: (row.actor_type as 'user' | 'system' | 'api_key') || undefined,
      action: row.action as string,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      changes: row.changes as Record<string, { old: unknown; new: unknown }> | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: (row.created_at as Date).toISOString(),
    }));

    let cursor: string | undefined;
    if (hasMore && entries.length > 0) {
      const last = entries[entries.length - 1]!;
      cursor = `${last.createdAt}:${last.id}`;
    }

    return { entries, cursor };
  }
}
