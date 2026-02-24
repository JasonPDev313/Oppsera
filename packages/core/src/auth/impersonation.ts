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
  status: string;
  expiresAt: Date;
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
  ipAddress?: string;
  userAgent?: string;
}): Promise<ImpersonationSession> {
  // Look up tenant name
  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);

  if (!tenant) {
    throw new AppError('NOT_FOUND', 'Tenant not found', 404);
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
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(adminImpersonationSessions).values({
    id,
    adminId: input.adminId,
    adminEmail: input.adminEmail,
    adminName: input.adminName,
    tenantId: input.tenantId,
    tenantName: tenant.name,
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
    status: 'pending',
    expiresAt,
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

  return {
    id: session.id,
    adminId: session.adminId,
    adminEmail: session.adminEmail,
    adminName: session.adminName,
    tenantId: session.tenantId,
    tenantName: session.tenantName,
    status: session.status,
    expiresAt: new Date(session.expiresAt),
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
