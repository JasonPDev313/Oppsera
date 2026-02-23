import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// ── Types ────────────────────────────────────────────────────────

export interface PortalSession {
  customerId: string;
  tenantId: string;
  email: string;
}

// ── JWT Secret ───────────────────────────────────────────────────

function getSecret(): Uint8Array {
  const secret = process.env.PORTAL_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('PORTAL_AUTH_SECRET must be set and at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

const COOKIE_NAME = 'portal_session';
const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// ── Token creation ───────────────────────────────────────────────

export async function createPortalToken(payload: PortalSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

// ── Token verification ───────────────────────────────────────────

export async function verifyPortalToken(token: string): Promise<PortalSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      customerId: payload.customerId as string,
      tenantId: payload.tenantId as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

// ── Session from request cookies (server-side) ───────────────────

export async function getPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyPortalToken(token);
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

export function clearSessionCookie(): {
  name: string;
  value: string;
  options: Record<string, unknown>;
} {
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
