import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── PATCH /api/v1/ai-support/feature-gaps/:id ──────────────────────
// Update status, priority, or admin notes on a feature gap

export const PATCH = withAdminPermission(async (req: NextRequest, session) => {
  const id = extractId(req);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const validStatuses = ['open', 'under_review', 'planned', 'shipped', 'dismissed'];
  const validPriorities = ['critical', 'high', 'medium', 'low'];

  const status = body.status as string | undefined;
  const priority = body.priority as string | undefined;
  const adminNotes = body.adminNotes as string | undefined;
  const featureRequestId = body.featureRequestId as string | undefined;

  if (status) {
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${validStatuses.join(', ')}` } },
        { status: 400 },
      );
    }
  }

  if (priority) {
    if (!validPriorities.includes(priority)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: `priority must be one of: ${validPriorities.join(', ')}` } },
        { status: 400 },
      );
    }
  }

  // Build dynamic update
  const result = await withAdminDb(async (tx) =>
    tx.execute(sql`
      UPDATE ai_support_feature_gaps SET
        status = COALESCE(${status ?? null}, status),
        priority = COALESCE(${priority ?? null}, priority),
        admin_notes = COALESCE(${adminNotes ?? null}, admin_notes),
        feature_request_id = COALESCE(${featureRequestId ?? null}, feature_request_id),
        reviewed_by = ${session.adminId},
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, status, priority, occurrence_count::int AS occurrence_count
    `),
  );

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Feature gap not found' } },
      { status: 404 },
    );
  }

  const updated = rows[0]!;
  return NextResponse.json({
    data: {
      id: updated.id,
      status: updated.status,
      priority: updated.priority,
      occurrenceCount: Number(updated.occurrence_count),
    },
  });
}, { permission: 'ai_support.admin' });
