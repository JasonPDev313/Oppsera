import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import {
  captureAllTenantHealthSnapshots,
  captureSystemMetrics,
  cleanupOldSnapshots,
} from '@/lib/health-scoring';

// ── POST /api/v1/health/capture — Trigger health snapshot capture ──
// Used by cron job or manual admin trigger.

export const POST = withAdminPermission(async (_req: NextRequest) => {
  const startTime = Date.now();

  // Capture all tenant health snapshots
  const snapshotCount = await captureAllTenantHealthSnapshots();

  // Capture system-wide metrics
  await captureSystemMetrics();

  // Clean up old snapshots (>30 days)
  const cleanup = await cleanupOldSnapshots();

  const durationMs = Date.now() - startTime;

  return NextResponse.json({
    data: {
      success: true,
      snapshotCount,
      cleanup: {
        tenantSnapshotsDeleted: cleanup.tenantDeleted,
        systemSnapshotsDeleted: cleanup.systemDeleted,
      },
      durationMs,
    },
  });
}, { permission: 'tenants.read' });
