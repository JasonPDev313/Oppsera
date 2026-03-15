import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql, sqlArray } from '@oppsera/db';

// ULID: 26 chars, Crockford base32
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

// ── POST /api/v1/ai-support/answers/bulk-status ──────────────────
// Bulk-update status for multiple answer cards.
// Body: { ids: string[], status: 'draft' | 'active' | 'stale' | 'archived' }

export const POST = withAdminPermission(async (req: NextRequest, session) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const rawIds = body.ids;
  const status = body.status as string | undefined;

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array' } },
      { status: 400 },
    );
  }

  // Validate every element is a valid ULID string
  if (!rawIds.every((id): id is string => typeof id === 'string' && ULID_RE.test(id))) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Every id must be a valid ULID' } },
      { status: 400 },
    );
  }

  // Deduplicate
  const ids = [...new Set(rawIds)];

  if (ids.length > 500) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Maximum 500 unique ids per request' } },
      { status: 400 },
    );
  }

  const validStatuses = ['draft', 'active', 'stale', 'archived'] as const;
  if (!status || !validStatuses.includes(status as typeof validStatuses[number])) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${validStatuses.join(', ')}` } },
      { status: 400 },
    );
  }

  const result = await withAdminDb(async (tx) =>
    tx.execute(sql`
      UPDATE ai_support_answer_cards
      SET status = ${status}, updated_at = NOW()
      WHERE id = ANY(${sqlArray(ids)})
      RETURNING id
    `),
  );

  const updatedRows = Array.from(result as Iterable<{ id: string }>);

  if (updatedRows.length === 0) {
    console.error('[bulk-status] UPDATE matched 0 rows — RLS may be blocking. ids:', ids.length, 'admin:', session.adminId);
    return NextResponse.json(
      { error: { code: 'UPDATE_FAILED', message: `No cards were updated (0 of ${ids.length}). This may be a permissions issue.` } },
      { status: 422 },
    );
  }

  if (updatedRows.length < ids.length) {
    console.warn('[bulk-status] Partial update:', updatedRows.length, 'of', ids.length, 'admin:', session.adminId);
  }

  return NextResponse.json({
    data: { updatedCount: updatedRows.length, requestedCount: ids.length, status },
  });
}, { permission: 'ai_support.answers.write' });
