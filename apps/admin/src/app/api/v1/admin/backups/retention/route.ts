import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { applyRetentionPolicy } from '@/lib/backup/retention-service';

// ── POST /api/v1/admin/backups/retention — Run retention cleanup ──

export const POST = withAdminAuth(async () => {
  const result = await applyRetentionPolicy();
  return NextResponse.json({
    data: { expired: result.expired },
  });
}, 'super_admin');
