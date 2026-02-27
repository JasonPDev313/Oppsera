/**
 * Login record queries — cursor-paginated, tenant-scoped (RLS).
 */

import { withTenant, createAdminClient } from '@oppsera/db';
import { loginRecords, adminLoginRecords } from '@oppsera/db';
import { desc, eq, and, gte, lte, sql } from 'drizzle-orm';

export interface ListLoginRecordsInput {
  tenantId: string;
  userId?: string;
  outcome?: 'success' | 'failed' | 'locked';
  from?: string; // ISO date
  to?: string;   // ISO date
  cursor?: string;
  limit?: number;
}

export interface LoginRecordRow {
  id: string;
  tenantId: string;
  userId: string | null;
  email: string;
  outcome: string;
  ipAddress: string | null;
  userAgent: string | null;
  geoCity: string | null;
  geoRegion: string | null;
  geoCountry: string | null;
  geoLatitude: string | null;
  geoLongitude: string | null;
  terminalId: string | null;
  terminalName: string | null;
  failureReason: string | null;
  createdAt: Date;
}

export interface ListLoginRecordsResult {
  items: LoginRecordRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listLoginRecords(
  input: ListLoginRecordsInput,
): Promise<ListLoginRecordsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(loginRecords.tenantId, input.tenantId)];

    if (input.userId) {
      conditions.push(eq(loginRecords.userId, input.userId));
    }
    if (input.outcome) {
      conditions.push(eq(loginRecords.outcome, input.outcome));
    }
    if (input.from) {
      conditions.push(gte(loginRecords.createdAt, new Date(input.from)));
    }
    if (input.to) {
      conditions.push(lte(loginRecords.createdAt, new Date(input.to)));
    }
    if (input.cursor) {
      conditions.push(
        sql`(${loginRecords.createdAt}, ${loginRecords.id}) < (
          SELECT ${loginRecords.createdAt}, ${loginRecords.id}
          FROM ${loginRecords}
          WHERE ${loginRecords.id} = ${input.cursor}
        )`,
      );
    }

    const rows = await tx
      .select()
      .from(loginRecords)
      .where(and(...conditions))
      .orderBy(desc(loginRecords.createdAt), desc(loginRecords.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map(mapLoginRecord),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

// ── Admin login records (no RLS) ─────────────────────────────────

export interface ListAdminLoginRecordsInput {
  adminId?: string;
  email?: string;
  outcome?: 'success' | 'failed';
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export async function listAdminLoginRecords(
  input: ListAdminLoginRecordsInput,
): Promise<ListLoginRecordsResult> {
  const limit = Math.min(input.limit ?? 50, 100);
  const adminDb = createAdminClient();

  const conditions = [];

  if (input.adminId) {
    conditions.push(eq(adminLoginRecords.adminId, input.adminId));
  }
  if (input.email) {
    conditions.push(eq(adminLoginRecords.email, input.email));
  }
  if (input.outcome) {
    conditions.push(eq(adminLoginRecords.outcome, input.outcome));
  }
  if (input.from) {
    conditions.push(gte(adminLoginRecords.createdAt, new Date(input.from)));
  }
  if (input.to) {
    conditions.push(lte(adminLoginRecords.createdAt, new Date(input.to)));
  }
  if (input.cursor) {
    conditions.push(
      sql`(${adminLoginRecords.createdAt}, ${adminLoginRecords.id}) < (
        SELECT ${adminLoginRecords.createdAt}, ${adminLoginRecords.id}
        FROM ${adminLoginRecords}
        WHERE ${adminLoginRecords.id} = ${input.cursor}
      )`,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await adminDb
    .select()
    .from(adminLoginRecords)
    .where(whereClause)
    .orderBy(desc(adminLoginRecords.createdAt), desc(adminLoginRecords.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: items.map(mapAdminLoginRecord),
    cursor: hasMore ? items[items.length - 1]!.id : null,
    hasMore,
  };
}

// ── Mappers ──────────────────────────────────────────────────────

function mapLoginRecord(row: typeof loginRecords.$inferSelect): LoginRecordRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    email: row.email,
    outcome: row.outcome,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    geoCity: row.geoCity,
    geoRegion: row.geoRegion,
    geoCountry: row.geoCountry,
    geoLatitude: row.geoLatitude,
    geoLongitude: row.geoLongitude,
    terminalId: row.terminalId,
    terminalName: row.terminalName,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
  };
}

function mapAdminLoginRecord(row: typeof adminLoginRecords.$inferSelect): LoginRecordRow {
  return {
    id: row.id,
    tenantId: '',
    userId: row.adminId,
    email: row.email,
    outcome: row.outcome,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    geoCity: row.geoCity,
    geoRegion: row.geoRegion,
    geoCountry: row.geoCountry,
    geoLatitude: row.geoLatitude,
    geoLongitude: row.geoLongitude,
    terminalId: null,
    terminalName: null,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
  };
}
