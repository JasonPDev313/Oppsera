import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Edge middleware for the member portal.
 * Handles fast auth redirects without waiting for server component DB queries.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API routes, static files, and public pages
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/find-club' ||
    pathname === '/' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Extract tenant slug from /{slug}/... pattern
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return NextResponse.next();

  const tenantSlug = segments[0];
  const subPath = segments.slice(1).join('/');

  // Check if user has a portal session cookie
  const hasSession = request.cookies.has('portal_session');

  // If visiting /slug/login and already authenticated, redirect to dashboard
  if (subPath === 'login' && hasSession) {
    return NextResponse.redirect(new URL(`/${tenantSlug}/dashboard`, request.url));
  }

  // If visiting a protected route (not login, not the slug root) without a session, redirect to login
  if (subPath && subPath !== 'login' && !hasSession) {
    return NextResponse.redirect(new URL(`/${tenantSlug}/login`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and API
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
