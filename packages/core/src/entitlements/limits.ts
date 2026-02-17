import { eq, and } from 'drizzle-orm';
import { db, memberships, locations, sql } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import { getEntitlementEngine } from './engine';

export async function checkSeatLimit(tenantId: string): Promise<void> {
  const limits = await getEntitlementEngine().getModuleLimits(tenantId, 'platform_core');
  if (!limits?.max_seats) return;

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, 'active')));

  if ((result?.count ?? 0) >= limits.max_seats) {
    throw new AppError('SEAT_LIMIT_REACHED', `Maximum ${limits.max_seats} users allowed on your plan`, 403);
  }
}

export async function checkLocationLimit(tenantId: string): Promise<void> {
  const limits = await getEntitlementEngine().getModuleLimits(tenantId, 'platform_core');
  if (!limits?.max_locations) return;

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(locations)
    .where(and(eq(locations.tenantId, tenantId), eq(locations.isActive, true)));

  if ((result?.count ?? 0) >= limits.max_locations) {
    throw new AppError('LOCATION_LIMIT_REACHED', `Maximum ${limits.max_locations} locations allowed on your plan`, 403);
  }
}
