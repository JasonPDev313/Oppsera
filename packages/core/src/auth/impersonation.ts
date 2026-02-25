import jwt from 'jsonwebtoken';
import { eq, and, sql } from 'drizzle-orm';
import { db, adminImpersonationSessions, tenants } from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';

// ── Types ────────────────────────────────────────────────────────

export interface ImpersonationInfo {
  adminId: string;
  adminEmail: string;
  sessionId: string;
}

export interface ImpersonationClaims {
  type: 'impersonation';
  sessionId: string;
  adminId: string;
  adminEmail: string;
  adminName: string;
  tenantId: string;
}

export interface ImpersonationTokenPayload {
  sub: string; // 'admin:{adminId}'
  imp: {
    sessionId: string;
    adminId: string;
    adminEmail: string;
    tenantId: string;
  };
  tokenType?: 'refresh';
}

export interface ImpersonationSession {
  id: string;
  adminId: string;
  adminEmail: string;
  adminName: string;
  tenantId: string;
  tenantName: string;
  targetUserId: string | null;
  reason: string | null;
  maxDurationMinutes: number;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  actionCount: number;
  expiresAt: Date;
  createdAt: Date;
}

// ── Secrets ──────────────────────────────────────────────────────

const DEV_SECRET = 'oppsera-dev-secret-do-not-use-in-production';

function getImpersonationSecret(): string {
  const secret = process.env.ADMIN_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_AUTH_SECRET required for impersonation (min 32 chars)');
  }
  return secret;
}

function isDevMode(): boolean {
  return process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
}

function getSigningSecret(): string {
  return isDevMode() ? DEV_SECRET : getImpersonationSecret();
}

function getVerifySecrets(): string[] {
  const secrets: string[] = [];
  if (isDevMode()) {
    secrets.push(DEV_SECRET);
  }
  try {
    secrets.push(getImpersonationSecret());
  } catch {
    // ADMIN_AUTH_SECRET not set — only dev secret available
  }
  return secrets;
}

// ── Exchange Token (admin → web, one-time, 5 min) ───────────────

const EXCHANGE_TOKEN_TTL = 300; // 5 minutes

export function createExchangeToken(claims: ImpersonationClaims): string {
  return jwt.sign(claims, getSigningSecret(), {
    algorithm: 'HS256',
    expiresIn: EXCHANGE_TOKEN_TTL,
  });
}

export function verifyExchangeToken(token: string): ImpersonationClaims | null {
  const secrets = getVerifySecrets();
  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as ImpersonationClaims;
      if (decoded.type !== 'impersonation') continue;
      return decoded;
    } catch {
      continue;
    }
  }
  return null;
}

// ── Impersonation Access/Refresh Tokens (web app internal) ──────

const ACCESS_TTL = '1h';
const REFRESH_TTL = '1h'; // Same as access — sessions are short-lived

export function createImpersonationAccessToken(payload: ImpersonationTokenPayload): string {
  return jwt.sign(payload, getSigningSecret(), {
    algorithm: 'HS256',
    expiresIn: ACCESS_TTL,
  });
}

export function createImpersonationRefreshToken(payload: ImpersonationTokenPayload): string {
  return jwt.sign(
    { ...payload, tokenType: 'refresh' },
    getSigningSecret(),
    { algorithm: 'HS256', expiresIn: REFRESH_TTL },
  );
}

export function verifyImpersonationToken(token: string): ImpersonationTokenPayload | null {
  const secrets = getVerifySecrets();
  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as ImpersonationTokenPayload;
      if (decoded.imp?.sessionId) return decoded;
    } catch {
      continue;
    }
  }
  return null;
}

// ── Session DB Operations ────────────────────────────────────────

export async function createImpersonationSession(input: {
  adminId: string;
  adminEmail: string;
  adminName: string;
  tenantId: string;
  targetUserId?: string;
  reason?: string;
  maxDurationMinutes?: number;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ImpersonationSession> {
  const maxMinutes = input.maxDurationMinutes ?? 60;

  // Look up tenant name and status
  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);

  if (!tenant) {
    throw new AppError('NOT_FOUND', 'Tenant not found', 404);
  }

  if (tenant.status === 'suspended') {
    throw new AppError('VALIDATION_ERROR', 'Cannot impersonate a suspended tenant', 400);
  }

  // End any existing active/pending sessions for this admin
  await db
    .update(adminImpersonationSessions)
    .set({
      status: 'ended',
      endedAt: new Date(),
      endReason: 'new_session',
    })
    .where(
      and(
        eq(adminImpersonationSessions.adminId, input.adminId),
        sql`${adminImpersonationSessions.status} IN ('pending', 'active')`,
      ),
    );

  const id = generateUlid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + maxMinutes * 60 * 1000);

  await db.insert(adminImpersonationSessions).values({
    id,
    adminId: input.adminId,
    adminEmail: input.adminEmail,
    adminName: input.adminName,
    tenantId: input.tenantId,
    tenantName: tenant.name,
    targetUserId: input.targetUserId ?? null,
    reason: input.reason ?? null,
    maxDurationMinutes: maxMinutes,
    status: 'pending',
    expiresAt,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  return {
    id,
    adminId: input.adminId,
    adminEmail: input.adminEmail,
    adminName: input.adminName,
    tenantId: input.tenantId,
    tenantName: tenant.name,
    targetUserId: input.targetUserId ?? null,
    reason: input.reason ?? null,
    maxDurationMinutes: maxMinutes,
    status: 'pending',
    startedAt: null,
    endedAt: null,
    actionCount: 0,
    expiresAt,
    createdAt: now,
  };
}

export async function activateImpersonationSession(sessionId: string): Promise<void> {
  await db
    .update(adminImpersonationSessions)
    .set({ status: 'active', startedAt: new Date() })
    .where(eq(adminImpersonationSessions.id, sessionId));
}

export async function getActiveImpersonationSession(
  sessionId: string,
): Promise<ImpersonationSession | null> {
  const [session] = await db
    .select()
    .from(adminImpersonationSessions)
    .where(eq(adminImpersonationSessions.id, sessionId))
    .limit(1);

  if (!session) return null;
  if (session.status !== 'active' && session.status !== 'pending') return null;
  if (new Date(session.expiresAt) < new Date()) return null;

  return mapSession(session);
}

function mapSession(session: typeof adminImpersonationSessions.$inferSelect): ImpersonationSession {
  return {
    id: session.id,
    adminId: session.adminId,
    adminEmail: session.adminEmail,
    adminName: session.adminName,
    tenantId: session.tenantId,
    tenantName: session.tenantName,
    targetUserId: session.targetUserId ?? null,
    reason: session.reason ?? null,
    maxDurationMinutes: session.maxDurationMinutes,
    status: session.status,
    startedAt: session.startedAt ? new Date(session.startedAt) : null,
    endedAt: session.endedAt ? new Date(session.endedAt) : null,
    actionCount: session.actionCount,
    expiresAt: new Date(session.expiresAt),
    createdAt: new Date(session.createdAt),
  };
}

export async function endImpersonationSession(
  sessionId: string,
  reason: string,
): Promise<void> {
  await db
    .update(adminImpersonationSessions)
    .set({
      status: 'ended',
      endedAt: new Date(),
      endReason: reason,
    })
    .where(eq(adminImpersonationSessions.id, sessionId));
}

export async function incrementImpersonationActionCount(sessionId: string): Promise<void> {
  await db.execute(
    sql`UPDATE admin_impersonation_sessions
        SET action_count = action_count + 1
        WHERE id = ${sessionId}`,
  );
}

// ── Admin-scoped queries ─────────────────────────────────────────

/** Get the currently active impersonation session for a given admin */
export async function getActiveSessionForAdmin(
  adminId: string,
): Promise<ImpersonationSession | null> {
  const [session] = await db
    .select()
    .from(adminImpersonationSessions)
    .where(
      and(
        eq(adminImpersonationSessions.adminId, adminId),
        sql`${adminImpersonationSessions.status} IN ('pending', 'active')`,
        sql`${adminImpersonationSessions.expiresAt} > now()`,
      ),
    )
    .limit(1);

  if (!session) return null;
  return mapSession(session);
}

/** List impersonation session history with optional filters and cursor pagination */
export async function listImpersonationHistory(filters: {
  adminId?: string;
  tenantId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: ImpersonationSession[]; cursor: string | null; hasMore: boolean }> {
  const limit = Math.min(filters.limit ?? 25, 100);
  const conditions = [];

  if (filters.adminId) {
    conditions.push(eq(adminImpersonationSessions.adminId, filters.adminId));
  }
  if (filters.tenantId) {
    conditions.push(eq(adminImpersonationSessions.tenantId, filters.tenantId));
  }
  if (filters.status) {
    conditions.push(eq(adminImpersonationSessions.status, filters.status));
  }
  if (filters.cursor) {
    conditions.push(sql`${adminImpersonationSessions.id} < ${filters.cursor}`);
  }

  const rows = await db
    .select()
    .from(adminImpersonationSessions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${adminImpersonationSessions.createdAt} DESC`)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: items.map(mapSession),
    cursor: hasMore ? items[items.length - 1]!.id : null,
    hasMore,
  };
}

/** Expire all overdue active sessions. Returns the number of sessions expired. */
export async function expireOverdueSessions(): Promise<ImpersonationSession[]> {
  const rows = await db.execute(
    sql`UPDATE admin_impersonation_sessions
        SET status = 'expired', ended_at = now(), end_reason = 'expired'
        WHERE status IN ('pending', 'active') AND expires_at < now()
        RETURNING *`,
  );

  const results = Array.from(rows as Iterable<Record<string, unknown>>);
  return results.map((r) => ({
    id: r.id as string,
    adminId: r.admin_id as string,
    adminEmail: r.admin_email as string,
    adminName: r.admin_name as string,
    tenantId: r.tenant_id as string,
    tenantName: r.tenant_name as string,
    targetUserId: (r.target_user_id as string) ?? null,
    reason: (r.reason as string) ?? null,
    maxDurationMinutes: (r.max_duration_minutes as number) ?? 60,
    status: 'expired',
    startedAt: r.started_at ? new Date(r.started_at as string) : null,
    endedAt: new Date(),
    actionCount: (r.action_count as number) ?? 0,
    expiresAt: new Date(r.expires_at as string),
    createdAt: new Date(r.created_at as string),
  }));
}
