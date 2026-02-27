/**
 * Login event recorder — inserts into login_records / admin_login_records.
 * Uses createAdminClient() to bypass RLS (login routes are { public: true }).
 * All functions are fire-and-forget safe (never throw).
 */

import { createAdminClient, loginRecords, adminLoginRecords } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { GeoInfo } from './ip-geolocation';
import { eq, and, desc, isNull, gte } from 'drizzle-orm';

export interface RecordLoginParams {
  tenantId: string;
  userId: string | null;
  email: string;
  outcome: 'success' | 'failed' | 'locked';
  ipAddress: string | undefined;
  userAgent: string | undefined;
  geo: GeoInfo;
  failureReason?: string;
}

export async function recordLoginEvent(params: RecordLoginParams): Promise<string | null> {
  try {
    const adminDb = createAdminClient();
    const id = generateUlid();
    await adminDb.insert(loginRecords).values({
      id,
      tenantId: params.tenantId,
      userId: params.userId,
      email: params.email,
      outcome: params.outcome,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      geoCity: params.geo.city,
      geoRegion: params.geo.region,
      geoCountry: params.geo.country,
      geoLatitude: params.geo.latitude,
      geoLongitude: params.geo.longitude,
      failureReason: params.failureReason ?? null,
    });
    return id;
  } catch (err) {
    console.error('[login-recorder] Failed to record login event:', err);
    return null;
  }
}

export interface RecordAdminLoginParams {
  adminId: string | null;
  email: string;
  outcome: 'success' | 'failed';
  ipAddress: string | undefined;
  userAgent: string | undefined;
  geo: GeoInfo;
  failureReason?: string;
}

export async function recordAdminLoginEvent(params: RecordAdminLoginParams): Promise<void> {
  try {
    const adminDb = createAdminClient();
    await adminDb.insert(adminLoginRecords).values({
      id: generateUlid(),
      adminId: params.adminId,
      email: params.email,
      outcome: params.outcome,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      geoCity: params.geo.city,
      geoRegion: params.geo.region,
      geoCountry: params.geo.country,
      geoLatitude: params.geo.latitude,
      geoLongitude: params.geo.longitude,
      failureReason: params.failureReason ?? null,
    });
  } catch (err) {
    console.error('[login-recorder] Failed to record admin login event:', err);
  }
}

/**
 * Stamp terminal info on the user's most recent login record (within last 24h).
 * Called after terminal selection — fire-and-forget.
 */
export async function stampLoginTerminal(
  tenantId: string,
  userId: string,
  terminalId: string,
  terminalName: string | null,
): Promise<void> {
  try {
    const adminDb = createAdminClient();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find most recent successful login for this user without a terminal stamp
    const rows = await adminDb
      .select({ id: loginRecords.id })
      .from(loginRecords)
      .where(
        and(
          eq(loginRecords.tenantId, tenantId),
          eq(loginRecords.userId, userId),
          eq(loginRecords.outcome, 'success'),
          isNull(loginRecords.terminalId),
          gte(loginRecords.createdAt, cutoff),
        ),
      )
      .orderBy(desc(loginRecords.createdAt))
      .limit(1);

    const row = rows[0];
    if (!row) return;

    await adminDb
      .update(loginRecords)
      .set({ terminalId, terminalName })
      .where(eq(loginRecords.id, row.id));
  } catch (err) {
    console.error('[login-recorder] Failed to stamp terminal:', err);
  }
}
