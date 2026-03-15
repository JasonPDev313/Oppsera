import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

// ── POST /api/v1/ai-support/answers/bulk-status ──────────────────
// Bulk-update status for multiple answer cards.
// Body: { ids: string[], status: 'draft' | 'active' | 'stale' | 'archived' }

export const POST = withAdminPermission(async (req: NextRequest, _session) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const ids = body.ids;
  const status = body.status as string | undefined;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array' } },
      { status: 400 },
    );
  }

  // Validate every element is a string (prevent injection of objects/numbers)
  if (!ids.every((id): id is string => typeof id === 'string' && id.length > 0)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Every id must be a non-empty string' } },
      { status: 400 },
    );
  }

  if (ids.length > 500) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Maximum 500 ids per request' } },
      { status: 400 },
    );
  }

  const validStatuses = ['draft', 'active', 'stale', 'archived'];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${validStatuses.join(', ')}` } },
      { status: 400 },
    );
  }

  // Build parameterized IN clause
  const idParams = ids.map((id) => sql`${id}`);
  const inClause = sql.join(idParams, sql`, `);

  const result = await withAdminDb(async (tx) =>
    tx.execute(sql`
      UPDATE ai_support_answer_cards
      SET status = ${status}, updated_at = NOW()
      WHERE id IN (${inClause})
      RETURNING id
    `),
  );

  const updatedRows = Array.from(result as Iterable<{ id: string }>);

  return NextResponse.json({
    data: { updatedCount: updatedRows.length, status },
  });
}, { permission: 'ai_support.answers.write' });
