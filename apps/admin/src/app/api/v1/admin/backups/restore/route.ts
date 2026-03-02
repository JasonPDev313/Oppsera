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
import { validateBackup, validateTenantRestore, executeRestore, executeTenantRestore } from '@/lib/backup/restore-service';

// ── POST /api/v1/admin/backups/restore — Request a restore ───────

const restoreSchema = z.object({
  backupId: z.string().min(1),
  confirmationPhrase: z.string().min(1),
  tenantId: z.string().min(1).optional(),
  // When provided, restore only affects rows belonging to this tenant_id.
  // Platform/system tables are left untouched.
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

  const { backupId, confirmationPhrase, tenantId } = parsed.data;

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

  // Run compatibility check (tenant-scoped or full)
  const payload = await loadBackupPayload(backupId);
  const validation = tenantId
    ? await validateTenantRestore(payload, tenantId)
    : await validateBackup(payload);
  if (!validation.compatible) {
    return NextResponse.json(
      { error: { code: 'INCOMPATIBLE', message: 'Backup is not compatible', details: validation.errors } },
      { status: 422 },
    );
  }

  // For tenant-scoped restores, include tenant-specific info in response
  const tenantValidation = tenantId ? validation as import('@/lib/backup/types').TenantRestoreValidation : null;
  const tenantInfo = tenantValidation
    ? { tenantTables: tenantValidation.tenantTables, tenantRowCount: tenantValidation.tenantRowCount }
    : undefined;

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
      scopeTenantId: tenantId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      data: {
        restoreId,
        status: 'pending_approval',
        message: tenantId
          ? `Tenant-scoped restore request created for tenant ${tenantId}. Waiting for approval from another admin.`
          : 'Restore request created. Waiting for approval from another admin.',
        warnings: validation.warnings,
        ...(tenantInfo && { tenantInfo }),
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
    scopeTenantId: tenantId ?? null,
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // Execute restore — MUST await before returning response (Vercel gotcha #466).
  // Fire-and-forget DB work creates zombie connections on Vercel serverless.
  try {
    if (tenantId) {
      await executeTenantRestore(restoreId);
    } else {
      await executeRestore(restoreId);
    }
  } catch (err) {
    console.error(`[restore] Restore ${restoreId} failed:`, err);
    return NextResponse.json({
      error: {
        code: 'RESTORE_FAILED',
        message: err instanceof Error ? err.message : 'Restore failed',
      },
    }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      restoreId,
      status: 'completed',
      message: tenantId
        ? `Tenant-scoped restore completed successfully for tenant ${tenantId}.`
        : 'Restore completed successfully.',
      warnings: validation.warnings,
      ...(tenantInfo && { tenantInfo }),
    },
  }, { status: 201 });
}, 'super_admin');
