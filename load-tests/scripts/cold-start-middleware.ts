/**
 * Cold Start Detection Middleware for Next.js
 *
 * Drop-in middleware that adds cold start tracking headers to API responses.
 * Deploy this alongside the load-test-enabled staging environment.
 *
 * Headers added:
 *   X-Cold-Start: true|false — whether this request was a cold start
 *   X-Function-Instance: <uuid> — unique ID for this function instance
 *   X-Request-Start: <timestamp> — server-side request start time
 *   X-Instance-Age-Ms: <ms> — how long this instance has been alive
 *
 * Integration:
 *   Import in apps/web/src/middleware.ts (staging only):
 *
 *   import { withColdStartHeaders } from '@/lib/cold-start-middleware';
 *
 *   export function middleware(request: NextRequest) {
 *     const response = NextResponse.next();
 *     return withColdStartHeaders(response);
 *   }
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// Module-level state — reset on cold start (new function instance)
const INSTANCE_ID = randomUUID();
const INSTANCE_BIRTH = Date.now();
let requestCount = 0;
let isFirstRequest = true;

/**
 * Add cold start detection headers to a NextResponse.
 * Call this in your middleware or API routes.
 */
export function withColdStartHeaders(response: NextResponse): NextResponse {
  const now = Date.now();
  const isColdStart = isFirstRequest;

  response.headers.set('X-Cold-Start', isColdStart ? 'true' : 'false');
  response.headers.set('X-Function-Instance', INSTANCE_ID);
  response.headers.set('X-Request-Start', now.toString());
  response.headers.set('X-Instance-Age-Ms', (now - INSTANCE_BIRTH).toString());
  response.headers.set('X-Instance-Request-Count', (++requestCount).toString());

  // After first request, no longer cold
  if (isFirstRequest) {
    isFirstRequest = false;
  }

  return response;
}

/**
 * Wrap an API route handler to add cold start headers.
 * Use for route-level instrumentation when not using middleware.
 *
 * Example:
 *   export const GET = withColdStartTracking(async (req) => {
 *     return NextResponse.json({ data: ... });
 *   });
 */
export function withColdStartTracking(
  handler: (request: Request) => Promise<NextResponse>,
) {
  return async (request: Request): Promise<NextResponse> => {
    const response = await handler(request);
    return withColdStartHeaders(response);
  };
}
