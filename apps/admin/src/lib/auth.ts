import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from '@oppsera/db';
import { platformAdmins } from '@oppsera/db';
import { eq } from 'drizzle-orm';

// ── Types ────────────────────────────────────────────────────────

export type AdminRole = 'super_admin' | 'admin' | 'viewer';

export interface AdminSession {
  adminId: string;
  email: string;
  name: string;
  role: AdminRole;
}

// ── JWT Secret ───────────────────────────────────────────────────

function getSecret(): Uint8Array {
  const secret = process.env.ADMIN_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_AUTH_SECRET must be set and at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

const COOKIE_NAME = 'oppsera_admin_session';
const TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8 hours

// ── Token creation ───────────────────────────────────────────────

export async function createAdminToken(payload: AdminSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

// ── Token verification ───────────────────────────────────────────

export async function verifyAdminToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      adminId: payload.adminId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as AdminRole,
    };
  } catch {
    return null;
  }
}

// ── Session from request cookies (server-side) ───────────────────

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAdminToken(token);
}

// ── Session cookie helpers ───────────────────────────────────────

export function makeSessionCookie(token: string): {
  name: string;
  value: string;
  options: Record<string, unknown>;
} {
  return {
    name: COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: TOKEN_TTL_SECONDS,
      path: '/',
    },
  };
}

export function clearSessionCookie(): { name: string; value: string; options: Record<string, unknown> } {
  return {
    name: COOKIE_NAME,
    value: '',
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    },
  };
}

// ── Database lookup ──────────────────────────────────────────────

export async function getAdminByEmail(email: string) {
  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.email, email.toLowerCase().trim()))
    .limit(1);
  return admin ?? null;
}

export async function updateAdminLastLogin(adminId: string): Promise<void> {
  await db
    .update(platformAdmins)
    .set({ lastLoginAt: new Date() })
    .where(eq(platformAdmins.id, adminId));
}

// ── Role guards ──────────────────────────────────────────────────

export function requireRole(session: AdminSession, minRole: AdminRole): boolean {
  const ROLE_LEVELS: Record<AdminRole, number> = {
    viewer: 1,
    admin: 2,
    super_admin: 3,
  };
  return ROLE_LEVELS[session.role] >= ROLE_LEVELS[minRole];
}
