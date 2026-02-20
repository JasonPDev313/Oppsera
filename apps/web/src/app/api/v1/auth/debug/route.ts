import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db, users } from '@oppsera/db';

/**
 * Diagnostic endpoint — traces the auth chain step by step.
 * Call with Authorization: Bearer <token> to test token validation.
 * Call without token to test DB connectivity only.
 *
 * TODO: Remove this endpoint once auth issues are resolved.
 */
export async function GET(request: Request) {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasJwtSecret: !!process.env.SUPABASE_JWT_SECRET,
    hasJwtJwk: !!process.env.SUPABASE_JWT_JWK,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    dbPoolMax: process.env.DB_POOL_MAX || '(not set, default 5)',
    devAuthBypass: process.env.DEV_AUTH_BYPASS || '(not set)',
  };

  // Step 1: Test DB connectivity
  try {
    const userCount = await db.query.users.findMany({ limit: 1 });
    results.dbConnected = true;
    results.dbHasUsers = userCount.length > 0;
  } catch (err) {
    results.dbConnected = false;
    results.dbError = err instanceof Error ? err.message : String(err);
  }

  // Step 2: Check token if provided
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // Decode without verification to see payload
    try {
      const decoded = jwt.decode(token, { complete: true });
      results.tokenDecoded = {
        header: decoded?.header,
        sub: (decoded?.payload as Record<string, unknown>)?.sub,
        iss: (decoded?.payload as Record<string, unknown>)?.iss,
        exp: (decoded?.payload as Record<string, unknown>)?.exp,
        role: (decoded?.payload as Record<string, unknown>)?.role,
      };
    } catch {
      results.tokenDecoded = 'FAILED';
    }

    // Verify with JWK if available
    if (process.env.SUPABASE_JWT_JWK) {
      try {
        const { createPublicKey } = await import('node:crypto');
        const jwk = JSON.parse(process.env.SUPABASE_JWT_JWK);
        const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
        const verified = jwt.verify(token, publicKey, { algorithms: ['ES256'] }) as Record<string, unknown>;
        results.jwtVerifyJwk = { success: true, sub: verified.sub };
      } catch (err) {
        results.jwtVerifyJwk = { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    // Verify with secret if available
    if (process.env.SUPABASE_JWT_SECRET) {
      try {
        const verified = jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms: ['HS256'] }) as Record<string, unknown>;
        results.jwtVerifySecret = { success: true, sub: verified.sub };
      } catch (err) {
        results.jwtVerifySecret = { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    // Look up user by authProviderId (what validateToken does)
    const decoded = jwt.decode(token) as { sub?: string } | null;
    if (decoded?.sub && results.dbConnected) {
      try {
        const user = await db.query.users.findFirst({
          where: eq(users.authProviderId, decoded.sub),
        });
        results.userLookupByAuthProviderId = user
          ? { found: true, userId: user.id, email: user.email, authProviderId: user.authProviderId }
          : { found: false, searchedFor: decoded.sub };

        // Also try looking up by ID (what DevAuthAdapter does)
        const userById = await db.query.users.findFirst({
          where: eq(users.id, decoded.sub),
        });
        results.userLookupById = userById
          ? { found: true, userId: userById.id, email: userById.email }
          : { found: false, searchedFor: decoded.sub };
      } catch (err) {
        results.userLookup = { error: err instanceof Error ? err.message : String(err) };
      }
    }
  } else {
    results.token = 'No Authorization header provided';
  }

  return NextResponse.json({ data: results });
}
