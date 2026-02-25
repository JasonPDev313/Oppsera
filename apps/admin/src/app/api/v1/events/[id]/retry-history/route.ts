import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export const GET = withAdminPermission(async (
  _req: NextRequest,
  _session,
  params,
) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id required' } },
      { status: 400 },
    );
  }

  const result = await db.execute(sql`
    SELECT
      r.id,
      r.dead_letter_id,
      r.retry_number,
      r.retried_by,
      r.retry_result,
      r.error_message,
      r.retried_at,
      pa.name as admin_name
    FROM dead_letter_retry_log r
    LEFT JOIN platform_admins pa ON pa.id = r.retried_by
    WHERE r.dead_letter_id = ${id}
    ORDER BY r.retry_number DESC
  `);

  const rows = Array.from(result as Iterable<Record<string, unknown>>);

  return NextResponse.json({
    data: rows.map(r => ({
      id: r.id as string,
      deadLetterId: r.dead_letter_id as string,
      retryNumber: r.retry_number as number,
      retriedBy: r.retried_by as string,
      adminName: r.admin_name as string | null,
      retryResult: r.retry_result as string,
      errorMessage: r.error_message as string | null,
      retriedAt: r.retried_at as string,
    })),
  });
}, { permission: 'events.dlq.view' });
