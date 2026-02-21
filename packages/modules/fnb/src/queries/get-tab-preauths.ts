import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetTabPreauthsInput } from '../validation';

export interface TabPreauthItem {
  id: string;
  tabId: string;
  status: string;
  authAmountCents: number;
  capturedAmountCents: number | null;
  tipAmountCents: number | null;
  finalAmountCents: number | null;
  cardLast4: string;
  cardBrand: string | null;
  providerRef: string | null;
  isWalkout: boolean;
  authorizedAt: string;
  capturedAt: string | null;
  adjustedAt: string | null;
  finalizedAt: string | null;
  voidedAt: string | null;
  expiresAt: string | null;
}

export async function getTabPreauths(
  input: GetTabPreauthsInput,
): Promise<TabPreauthItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, tab_id, status, auth_amount_cents, captured_amount_cents,
                 tip_amount_cents, final_amount_cents, card_last4, card_brand,
                 provider_ref, is_walkout, authorized_at, captured_at,
                 adjusted_at, finalized_at, voided_at, expires_at
          FROM fnb_tab_preauths
          WHERE tab_id = ${input.tabId} AND tenant_id = ${input.tenantId}
          ORDER BY created_at DESC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      tabId: r.tab_id as string,
      status: r.status as string,
      authAmountCents: Number(r.auth_amount_cents),
      capturedAmountCents: r.captured_amount_cents != null ? Number(r.captured_amount_cents) : null,
      tipAmountCents: r.tip_amount_cents != null ? Number(r.tip_amount_cents) : null,
      finalAmountCents: r.final_amount_cents != null ? Number(r.final_amount_cents) : null,
      cardLast4: r.card_last4 as string,
      cardBrand: (r.card_brand as string) ?? null,
      providerRef: (r.provider_ref as string) ?? null,
      isWalkout: r.is_walkout as boolean,
      authorizedAt: (r.authorized_at as Date).toISOString(),
      capturedAt: r.captured_at ? (r.captured_at as Date).toISOString() : null,
      adjustedAt: r.adjusted_at ? (r.adjusted_at as Date).toISOString() : null,
      finalizedAt: r.finalized_at ? (r.finalized_at as Date).toISOString() : null,
      voidedAt: r.voided_at ? (r.voided_at as Date).toISOString() : null,
      expiresAt: r.expires_at ? (r.expires_at as Date).toISOString() : null,
    }));
  });
}
