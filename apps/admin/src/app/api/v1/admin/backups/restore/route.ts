import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@oppsera/db';
import { platformRestoreOperations } from '@oppsera/db/schema';
import { generateUlid } from '@oppsera/shared';
import { sql } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getBackupSettingsFromDb } from '@/lib/backup/retention-service';
import { loadBackupPayload } from '@/lib/backup/backup-service';
import { validateBackup, executeRestore } from '@/lib/backup/restore-service';

// ── POST /api/v1/admin/backups/restore — Request a restore ───────

const restoreSchema = z.object({
  backupId: z.string().min(1),
  confirmationPhrase: z.string().min(1),
});

export const POST = withAdminAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
      { status: 400 },
    );
  }

  const { backupId, confirmationPhrase } = parsed.data;

  // Verify backup exists and is completed
  const backupResult = await db.execute(
    sql`SELECT id, status FROM platform_backups WHERE id = ${backupId}`,
  );
  const backups = Array.from(backupResult as Iterable<{ id: string; status: string }>);
  if (backups.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Backup not found' } },
      { status: 404 },
    );
  }
  if (backups[0]!.status !== 'completed') {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: 'Only completed backups can be restored' } },
      { status: 409 },
    );
  }

  // Verify confirmation phrase
  const expectedPhrase = `RESTORE-${backupId.slice(-6)}`;
  if (confirmationPhrase !== expectedPhrase) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `Confirmation phrase must be "${expectedPhrase}"` } },
      { status: 400 },
    );
  }

  // Run compatibility check
  const payload = await loadBackupPayload(backupId);
  const validation = await validateBackup(payload);
  if (!validation.compatible) {
    return NextResponse.json(
      { error: { code: 'INCOMPATIBLE', message: 'Backup is not compatible', details: validation.errors } },
      { status: 422 },
    );
  }

  // Check if dual approval is required
  const settings = await getBackupSettingsFromDb();

  const restoreId = generateUlid();
  const now = new Date();

  if (settings.dualApprovalRequired) {
    // Create pending_approval — needs another admin to approve
    await db.insert(platformRestoreOperations).values({
      id: restoreId,
      backupId,
      status: 'pending_approval',
      requestedByAdminId: session.adminId,
      confirmationPhrase,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      data: {
        restoreId,
        status: 'pending_approval',
        message: 'Restore request created. Waiting for approval from another admin.',
        warnings: validation.warnings,
      },
    }, { status: 201 });
  }

  // No dual approval needed — execute immediately
  await db.insert(platformRestoreOperations).values({
    id: restoreId,
    backupId,
    status: 'approved',
    requestedByAdminId: session.adminId,
    approvedByAdminId: session.adminId,
    confirmationPhrase,
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // Execute restore in background (don't block the response)
  executeRestore(restoreId).catch((err) => {
    console.error(`[restore] Restore ${restoreId} failed:`, err);
  });

  return NextResponse.json({
    data: {
      restoreId,
      status: 'approved',
      message: 'Restore started. A safety backup is being created first.',
      warnings: validation.warnings,
    },
  }, { status: 201 });
}, 'super_admin');
