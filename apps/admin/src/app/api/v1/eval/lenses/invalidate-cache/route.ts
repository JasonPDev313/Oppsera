import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { invalidateRegistryCache } from '@oppsera/module-semantic/registry';

// ── POST /api/v1/eval/lenses/invalidate-cache ────────────────────
// Forces the in-memory semantic registry cache to reload from DB.
// After editing a system lens, the web app's cache will pick up changes
// within the 5-minute SWR window automatically. This endpoint clears
// the admin process cache immediately.

export const POST = withAdminAuth(async () => {
  invalidateRegistryCache();
  return NextResponse.json({
    data: { invalidated: true, invalidatedAt: new Date().toISOString() },
  });
}, 'admin');
