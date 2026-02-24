import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@oppsera/db';
import { platformRestoreOperations } from '@oppsera/db/schema';
import { sql, eq } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';

// ── POST /api/v1/admin/backups/restores/[id]/reject — Reject restore

const rejectSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const POST = withAdminAuth(async (req: NextRequest, session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing restore operation ID' } },
      { status: 400 },
    );
  }

  const body = await req.json();
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Rejection reason is required', details: parsed.error.issues } },
      { status: 400 },
    );
  }

  // Get restore operation
  const result = await db.execute(
    sql`SELECT id, status FROM platform_restore_operations WHERE id = ${id}`,
  );
  const rows = Array.from(result as Iterable<{ id: string; status: string }>);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Restore operation not found' } },
      { status: 404 },
    );
  }

  if (rows[0]!.status !== 'pending_approval') {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: `Cannot reject — status is "${rows[0]!.status}"` } },
      { status: 409 },
    );
  }

  const now = new Date();
  await db
    .update(platformRestoreOperations)
    .set({
      status: 'rejected',
      rejectedByAdminId: session.adminId,
      rejectionReason: parsed.data.reason,
      updatedAt: now,
    })
    .where(eq(platformRestoreOperations.id, id));

  return NextResponse.json({
    data: {
      id,
      status: 'rejected',
      reason: parsed.data.reason,
    },
  });
}, 'super_admin');
