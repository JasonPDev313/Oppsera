import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Lightweight health endpoint for load balancers and uptime monitors.
 * Returns immediately with no DB check — avoids consuming a connection pool slot.
 * Use /api/health for DB-verified status, /api/admin/health for full diagnostics.
 */
export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
