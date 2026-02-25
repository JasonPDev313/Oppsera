import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// GET - Get retry history for a dead letter
export const GET = withAdminPermission(async (_req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id required' } },
      { status: 400 },
    );
  }

  const result = await db.execute(sql`
    SELECT id, dead_letter_id, retry_number, retried_by, retry_result, error_message, retried_at
    FROM dead_letter_retry_log
    WHERE dead_letter_id = ${id}
    ORDER BY retry_number DESC
  `);

  const entries = Array.from(result as Iterable<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    deadLetterId: r.dead_letter_id as string,
    retryNumber: r.retry_number as number,
    retriedBy: r.retried_by as string,
    retryResult: r.retry_result as string,
    errorMessage: (r.error_message as string | null) ?? null,
    retriedAt: r.retried_at as string,
  }));

  return NextResponse.json({ data: entries });
}, { permission: 'tenants.view' });
