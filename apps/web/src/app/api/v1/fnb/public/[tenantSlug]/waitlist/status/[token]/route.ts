import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS, rateLimitHeaders } from '@oppsera/core/security';
import { resolveWaitlistTenant } from '../../../resolve-waitlist-tenant';

// ── Helpers ──────────────────────────────────────────────────────

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
function safeColor(c: unknown, fallback: string): string {
  const s = typeof c === 'string' ? c : '';
  return HEX_COLOR_RE.test(s) ? s : fallback;
}

function safeHttpsUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? url : null;
  } catch { return null; }
}

/**
 * GET /api/v1/fnb/public/[tenantSlug]/waitlist/status/[token]
 *
 * Public guest-facing status endpoint — returns position, estimated wait, status.
 * Token is scoped to the resolved tenant to prevent cross-tenant token portability.
 * Rate-limited, no auth required.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; token: string }> },
) {
  const { tenantSlug, token } = await params;

  // Rate limit
  const rlKey = getRateLimitKey(req, 'wl-status');
  const rl = checkRateLimit(rlKey, RATE_LIMITS.publicRead);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    // Resolve tenant from slug to enforce tenant isolation
    const resolved = await resolveWaitlistTenant(tenantSlug);
    if (!resolved) {
      console.warn(`[waitlist-status] Tenant resolution failed for slug: ${tenantSlug}`);
      return NextResponse.json(
        { error: { code: 'TENANT_NOT_FOUND', message: 'Waitlist not found' } },
        { status: 404 },
      );
    }

    const adminDb = createAdminClient();
    const rows = await adminDb.execute(sql`
      SELECT
        w.guest_name,
        w.party_size,
        w.position,
        w.status,
        w.quoted_wait_minutes,
        w.estimated_ready_at,
        w.seating_preference,
        w.created_at,
        w.notified_at,
        w.confirmation_status,
        w.location_id,
        l.name AS venue_name
      FROM fnb_waitlist_entries w
      LEFT JOIN locations l ON l.id = w.location_id
      WHERE w.guest_token = ${token}
        AND w.tenant_id = ${resolved.tenantId}
      LIMIT 1
    `);

    const entry = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!entry) {
      console.warn(`[waitlist-status] Entry not found for token (tenant: ${resolved.tenantId}, slug: ${tenantSlug})`);
      return NextResponse.json(
        { error: { code: 'ENTRY_NOT_FOUND', message: 'Waitlist entry not found' } },
        { status: 404 },
      );
    }

    // Get branding config for this location
    const configRows = await adminDb.execute(sql`
      SELECT branding, content_config, notification_config
      FROM fnb_waitlist_config
      WHERE tenant_id = ${resolved.tenantId}
        AND (location_id = ${String(entry.location_id)} OR location_id IS NULL)
        AND enabled = true
      ORDER BY location_id IS NULL ASC
      LIMIT 1
    `);
    const configRow = Array.from(configRows as Iterable<Record<string, unknown>>)[0];

    // Parse notification config for grace period
    const notifConfig = (configRow?.notification_config ?? {}) as Record<string, unknown>;
    const graceMinutes = Number(notifConfig.graceMinutes ?? 10);

    // Parse content config for "while you wait"
    const contentConfig = (configRow?.content_config ?? {}) as Record<string, unknown>;

    // Compute estimated minutes remaining
    let estimatedMinutes: number | null = null;
    if (entry.estimated_ready_at) {
      const readyAt = new Date(String(entry.estimated_ready_at)).getTime();
      const remaining = Math.max(0, Math.round((readyAt - Date.now()) / 60_000));
      estimatedMinutes = remaining;
    }

    // Build menu/content URL (only allow https)
    let menuUrl: string | null = null;
    if (contentConfig.whileYouWaitEnabled && contentConfig.whileYouWaitUrl) {
      menuUrl = safeHttpsUrl(contentConfig.whileYouWaitUrl);
    }

    // Parse branding — validate colors to prevent CSS injection in <style> tags
    const branding = (configRow?.branding ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      data: {
        guestName: String(entry.guest_name),
        partySize: Number(entry.party_size),
        position: Number(entry.position),
        status: String(entry.status),
        estimatedMinutes,
        quotedWaitMinutes: entry.quoted_wait_minutes != null ? Number(entry.quoted_wait_minutes) : null,
        joinedAt: String(entry.created_at),
        notifiedAt: entry.notified_at ? String(entry.notified_at) : null,
        notificationExpiryMinutes: graceMinutes,
        confirmationStatus: entry.confirmation_status ? String(entry.confirmation_status) : null,
        venueName: entry.venue_name ? String(entry.venue_name) : '',
        menuUrl,
        branding: {
          primaryColor: safeColor(branding.primaryColor, '#6366f1'),
          secondaryColor: safeColor(branding.secondaryColor, '#3b82f6'),
          accentColor: safeColor(branding.accentColor, '#22c55e'),
          logoUrl: safeHttpsUrl(branding.logoUrl),
          fontFamily: String(branding.fontFamily ?? 'Inter').replace(/[^A-Za-z0-9 _+-]/g, ''),
        },
        content: contentConfig.whileYouWaitEnabled ? {
          type: String(contentConfig.whileYouWaitType ?? 'text'),
          content: contentConfig.whileYouWaitContent ? String(contentConfig.whileYouWaitContent) : null,
          url: safeHttpsUrl(contentConfig.whileYouWaitUrl),
        } : null,
      },
    }, {
      headers: {
        ...rateLimitHeaders(rl),
        'Referrer-Policy': 'same-origin',
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch waitlist status' } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/v1/fnb/public/[tenantSlug]/waitlist/status/[token]
 *
 * Guest cancels their waitlist entry. Token scoped to resolved tenant.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; token: string }> },
) {
  const { tenantSlug, token } = await params;

  // Rate limit
  const rlKey = getRateLimitKey(req, 'wl-cancel');
  const rl = checkRateLimit(rlKey, RATE_LIMITS.publicWrite);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    // Resolve tenant to scope the cancel to the correct tenant
    const resolved = await resolveWaitlistTenant(tenantSlug);
    if (!resolved) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Waitlist not found' } },
        { status: 404 },
      );
    }

    const adminDb = createAdminClient();
    const entryRows = await adminDb.execute(sql`
      SELECT id, status FROM fnb_waitlist_entries
      WHERE guest_token = ${token}
        AND tenant_id = ${resolved.tenantId}
        AND status IN ('waiting', 'notified')
      LIMIT 1
    `);
    const entry = Array.from(entryRows as Iterable<Record<string, unknown>>)[0];
    if (!entry) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Waitlist entry not found or already removed' } },
        { status: 404 },
      );
    }

    await adminDb.execute(sql`
      UPDATE fnb_waitlist_entries
      SET status = 'left', canceled_at = now(), updated_at = now()
      WHERE id = ${String(entry.id)}
        AND tenant_id = ${resolved.tenantId}
    `);

    return NextResponse.json({ data: { status: 'left' } });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to leave waitlist' } },
      { status: 500 },
    );
  }
}
