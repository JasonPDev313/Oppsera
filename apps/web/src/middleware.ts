import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * CORS middleware for API routes.
 *
 * Same-origin requests (frontend → API on same domain) don't need CORS headers.
 * Cross-origin requests (admin portal, embed pages, external integrations) are
 * allowed only from explicitly configured origins.
 *
 * Configure via environment variables:
 *   CORS_ALLOWED_ORIGINS — comma-separated list of allowed origins
 *   APP_BASE_URL         — auto-allowed (the app's own URL)
 *   ADMIN_BASE_URL       — auto-allowed (admin portal)
 */

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  // Auto-allow the app's own URL and admin portal
  if (process.env.APP_BASE_URL) {
    origins.add(process.env.APP_BASE_URL.replace(/\/$/, ''));
  }
  if (process.env.ADMIN_BASE_URL) {
    origins.add(process.env.ADMIN_BASE_URL.replace(/\/$/, ''));
  }

  // Allow explicitly configured origins
  if (process.env.CORS_ALLOWED_ORIGINS) {
    for (const origin of process.env.CORS_ALLOWED_ORIGINS.split(',')) {
      const trimmed = origin.trim().replace(/\/$/, '');
      if (trimmed) origins.add(trimmed);
    }
  }

  // Dev: allow localhost variants
  if (process.env.NODE_ENV === 'development') {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:3001');
    origins.add('http://localhost:3002');
  }

  return origins;
}

// Cache allowed origins at module level (computed once per cold start)
let _cachedOrigins: Set<string> | null = null;
function getCachedOrigins(): Set<string> {
  if (!_cachedOrigins) _cachedOrigins = getAllowedOrigins();
  return _cachedOrigins;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': [
    'Content-Type',
    'Authorization',
    'X-Request-Nonce',
    'X-Request-Timestamp',
    'X-Step-Up-Token',
    'X-Idempotency-Key',
    'sentry-trace',
    'baggage',
  ].join(', '),
  'Access-Control-Max-Age': '86400', // 24h preflight cache
  'Access-Control-Allow-Credentials': 'true',
};

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');

  // Preflight (OPTIONS) — respond immediately with CORS headers
  if (request.method === 'OPTIONS') {
    const headers: Record<string, string> = { ...CORS_HEADERS, Vary: 'Origin' };
    if (origin && getCachedOrigins().has(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
    }
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();

  // Add CORS headers for cross-origin API requests
  if (origin && getCachedOrigins().has(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
  }

  // Reject cross-origin requests from unknown origins
  // (browser enforces this via missing Access-Control-Allow-Origin header)

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
