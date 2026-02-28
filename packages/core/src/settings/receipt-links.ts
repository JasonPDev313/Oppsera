/**
 * Receipt Public Links — Token-Based Digital Receipt Access
 *
 * CRUD functions for creating and querying public receipt links.
 * Auto-link generation never blocks POS — callers wrap in try/catch.
 */

import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { ReceiptDocument } from '@oppsera/shared';

// ── Lookup code alphabet (matches guest-pay) ─────────────────────
// Uppercase alpha + digits, excluding ambiguous chars: 0/O, 1/I/L
const LOOKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateLookupCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += LOOKUP_ALPHABET[bytes[i]! % LOOKUP_ALPHABET.length];
  }
  return code;
}

// ── Types ─────────────────────────────────────────────────────────

export interface ReceiptPublicLink {
  id: string;
  tenantId: string;
  orderId: string;
  token: string;
  lookupCode: string;
  receiptDocumentSnapshot: ReceiptDocument;
  variant: string;
  viewCount: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

// ── Create ────────────────────────────────────────────────────────

/**
 * Creates a public receipt link with a 256-bit unguessable token
 * and a 6-char human-readable lookup code.
 *
 * The caller (receipt build route) wraps this in try/catch
 * so POS receipt building never fails due to link creation.
 */
export async function createReceiptPublicLink(
  tenantId: string,
  orderId: string,
  document: ReceiptDocument,
  variant: string,
  expiryDays?: number,
): Promise<{ token: string; lookupCode: string }> {
  const id = generateUlid();
  const token = randomBytes(32).toString('base64url');

  // Compute expiry
  const expiresAt =
    expiryDays && expiryDays > 0
      ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
      : null;

  // Generate lookup code with collision retry (active links only)
  let lookupCode: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateLookupCode();
    const conflict = await db.execute(
      sql`SELECT 1 FROM receipt_public_links
          WHERE tenant_id = ${tenantId}
            AND UPPER(lookup_code) = ${candidate}
            AND is_active = true
          LIMIT 1`,
    );
    const conflictRows = Array.from(conflict as Iterable<Record<string, unknown>>);
    if (conflictRows.length === 0) {
      lookupCode = candidate;
      break;
    }
  }

  // Fallback — extremely unlikely but handle gracefully
  if (!lookupCode) {
    lookupCode = generateLookupCode(8); // longer code as last resort
  }

  const documentJson = JSON.stringify(document);

  await db.execute(
    sql`INSERT INTO receipt_public_links (
          id, tenant_id, order_id, token, lookup_code,
          receipt_document_snapshot, variant,
          expires_at, created_at
        ) VALUES (
          ${id}, ${tenantId}, ${orderId}, ${token}, ${lookupCode},
          ${documentJson}::jsonb, ${variant},
          ${expiresAt ? expiresAt.toISOString() : null}::timestamptz,
          NOW()
        )`,
  );

  return { token, lookupCode };
}

// ── Read by Token (public, no RLS) ───────────────────────────────

/**
 * Fetches a receipt link by its unguessable token.
 * No tenant context required — token is globally unique.
 * Returns null if not found, expired, or inactive.
 */
export async function getReceiptByToken(
  token: string,
): Promise<ReceiptPublicLink | null> {
  const rows = await db.execute(
    sql`SELECT id, tenant_id, order_id, token, lookup_code,
               receipt_document_snapshot, variant,
               view_count, first_viewed_at, last_viewed_at,
               expires_at, is_active, created_at
        FROM receipt_public_links
        WHERE token = ${token}
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > NOW())`,
  );

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) return null;

  return mapRow(arr[0]!);
}

// ── Read by Lookup Code (tenant-scoped) ──────────────────────────

/**
 * Fetches a receipt link by human-readable lookup code.
 * Requires tenantId for scoping (lookup codes are unique per tenant).
 */
export async function getReceiptByLookup(
  tenantId: string,
  lookupCode: string,
): Promise<ReceiptPublicLink | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, tenant_id, order_id, token, lookup_code,
                 receipt_document_snapshot, variant,
                 view_count, first_viewed_at, last_viewed_at,
                 expires_at, is_active, created_at
          FROM receipt_public_links
          WHERE tenant_id = ${tenantId}
            AND UPPER(lookup_code) = ${lookupCode.toUpperCase()}
            AND is_active = true
            AND (expires_at IS NULL OR expires_at > NOW())`,
    );

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) return null;

    return mapRow(arr[0]!);
  });
}

// ── Read links for an order (tenant-scoped) ──────────────────────

/**
 * Returns all receipt links for a given order (for internal API).
 */
export async function getReceiptLinksForOrder(
  tenantId: string,
  orderId: string,
): Promise<ReceiptPublicLink[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, tenant_id, order_id, token, lookup_code,
                 receipt_document_snapshot, variant,
                 view_count, first_viewed_at, last_viewed_at,
                 expires_at, is_active, created_at
          FROM receipt_public_links
          WHERE tenant_id = ${tenantId}
            AND order_id = ${orderId}
          ORDER BY created_at DESC`,
    );

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return arr.map(mapRow);
  });
}

// ── Increment View Count ─────────────────────────────────────────

/**
 * Atomically increments view count and updates view timestamps.
 * Fire-and-forget — caller does not await.
 */
export async function incrementViewCount(linkId: string): Promise<void> {
  await db.execute(
    sql`UPDATE receipt_public_links
        SET view_count = view_count + 1,
            first_viewed_at = COALESCE(first_viewed_at, NOW()),
            last_viewed_at = NOW()
        WHERE id = ${linkId}`,
  );
}

// ── Deactivate ───────────────────────────────────────────────────

/**
 * Deactivates a receipt link (soft delete).
 */
export async function deactivateReceiptLink(
  tenantId: string,
  linkId: string,
): Promise<void> {
  return withTenant(tenantId, async (tx) => {
    await tx.execute(
      sql`UPDATE receipt_public_links
          SET is_active = false
          WHERE id = ${linkId} AND tenant_id = ${tenantId}`,
    );
  });
}

// ── Record Email ─────────────────────────────────────────────────

/**
 * Records an email sent for a receipt link.
 * Returns false if rate limit exceeded (3 per token per hour).
 */
export async function recordReceiptEmail(
  tenantId: string,
  linkId: string,
  email: string,
): Promise<boolean> {
  // Check rate limit: 3 emails per link per hour
  const countResult = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt FROM receipt_emails
        WHERE receipt_link_id = ${linkId}
          AND sent_at > NOW() - INTERVAL '1 hour'`,
  );
  const countRows = Array.from(countResult as Iterable<Record<string, unknown>>);
  if ((countRows[0]?.cnt as number) >= 3) return false;

  const id = generateUlid();
  await db.execute(
    sql`INSERT INTO receipt_emails (id, tenant_id, receipt_link_id, email, sent_at, status)
        VALUES (${id}, ${tenantId}, ${linkId}, ${email}, NOW(), 'sent')`,
  );
  return true;
}

// ── Record Loyalty Signup ────────────────────────────────────────

/**
 * Records a loyalty signup from the digital receipt microsite.
 * Returns false if rate limit exceeded (5 signups per token).
 */
export async function recordLoyaltySignup(
  tenantId: string,
  linkId: string,
  input: { name: string; email?: string; phone?: string; optedInMarketing?: boolean },
): Promise<boolean> {
  // Check rate limit: 5 signups per link total
  const countResult = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt FROM receipt_loyalty_signups
        WHERE receipt_link_id = ${linkId}`,
  );
  const countRows = Array.from(countResult as Iterable<Record<string, unknown>>);
  if ((countRows[0]?.cnt as number) >= 5) return false;

  const id = generateUlid();
  await db.execute(
    sql`INSERT INTO receipt_loyalty_signups (
          id, tenant_id, receipt_link_id, name, email, phone,
          opted_in_marketing, created_at
        ) VALUES (
          ${id}, ${tenantId}, ${linkId}, ${input.name},
          ${input.email ?? null}, ${input.phone ?? null},
          ${input.optedInMarketing ?? false}, NOW()
        )`,
  );
  return true;
}

// ── Public Lookup by Code ────────────────────────────────────────

/**
 * Searches for receipt links by lookup code across all tenants.
 * No RLS context needed — uses superuser connection.
 * Returns all active, non-expired matches for proof-of-possession check.
 */
export async function getReceiptsByLookupCode(
  lookupCode: string,
): Promise<ReceiptPublicLink[]> {
  const rows = await db.execute(
    sql`SELECT id, tenant_id, order_id, token, lookup_code,
               receipt_document_snapshot, variant,
               view_count, first_viewed_at, last_viewed_at,
               expires_at, is_active, created_at
        FROM receipt_public_links
        WHERE UPPER(lookup_code) = ${lookupCode.toUpperCase()}
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > NOW())`,
  );

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  return arr.map(mapRow);
}

// ── Row Mapper ───────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): ReceiptPublicLink {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    orderId: row.order_id as string,
    token: row.token as string,
    lookupCode: row.lookup_code as string,
    receiptDocumentSnapshot: row.receipt_document_snapshot as ReceiptDocument,
    variant: row.variant as string,
    viewCount: (row.view_count as number) ?? 0,
    firstViewedAt: row.first_viewed_at ? String(row.first_viewed_at) : null,
    lastViewedAt: row.last_viewed_at ? String(row.last_viewed_at) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    isActive: (row.is_active as boolean) ?? true,
    createdAt: String(row.created_at),
  };
}
