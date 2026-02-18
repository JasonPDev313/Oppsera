import { NextResponse } from 'next/server';
import { db, sql } from '@oppsera/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public health endpoint for load balancers and uptime monitors.
 * Returns minimal info — detailed diagnostics are at /api/admin/health (auth required).
 */
export async function GET() {
  let status: 'healthy' | 'unhealthy' = 'healthy';

  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    status = 'unhealthy';
  }

  return NextResponse.json(
    { status },
    {
      status: status === 'unhealthy' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
