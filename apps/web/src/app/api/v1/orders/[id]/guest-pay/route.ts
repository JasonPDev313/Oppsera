import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { generateUlid } from '@oppsera/shared';

function generateLookupCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  let code = '';
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i]! % chars.length];
  }
  return code;
}

// POST /api/v1/orders/:id/guest-pay — create guest pay session for a retail order
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // URL: /api/v1/orders/[id]/guest-pay
    const orderId = segments[segments.indexOf('orders') + 1]!;
    const body = await request.json().catch(() => ({}));
    const clientRequestId = (body as Record<string, unknown>).clientRequestId as string | undefined;
    const locationId = ctx.locationId ?? '';

    const result = await publishWithOutbox(ctx, async (tx) => {
      // Idempotency
      if (clientRequestId) {
        const check = await checkIdempotency(tx, ctx.tenantId, clientRequestId, 'createRetailGuestPay');
        if (check.isDuplicate) return { result: check.originalResult as Record<string, unknown>, events: [] };
      }

      // Fetch the order
      const orders = await tx.execute(
        sql`SELECT id, status, subtotal, tax_total, service_charge_total, discount_total, total, customer_id
            FROM orders
            WHERE id = ${orderId} AND tenant_id = ${ctx.tenantId}`,
      );
      const orderRows = Array.from(orders as Iterable<Record<string, unknown>>);
      if (orderRows.length === 0) {
        throw new Error('Order not found');
      }
      const order = orderRows[0]!;
      const orderStatus = order.status as string;

      // Only allow for open or placed orders
      if (!['open', 'placed'].includes(orderStatus)) {
        throw new Error(`Cannot create guest pay session for order in status: ${orderStatus}`);
      }

      const totalCents = (order.total as number) ?? 0;
      if (totalCents <= 0) {
        throw new Error('Cannot create guest pay session for $0 order');
      }

      const subtotalCents = (order.subtotal as number) ?? 0;
      const taxCents = (order.tax_total as number) ?? 0;
      const serviceChargeCents = (order.service_charge_total as number) ?? 0;
      const discountCents = (order.discount_total as number) ?? 0;

      // Fetch tip settings for location
      const tipSettingsRows = await tx.execute(
        sql`SELECT tip_type, tip_presets, allow_custom_tip, allow_no_tip,
                   default_tip_index, tip_calculation_base, rounding_mode,
                   max_tip_percent, max_tip_amount_cents, session_expiry_minutes
            FROM guest_pay_tip_settings
            WHERE tenant_id = ${ctx.tenantId} AND location_id = ${locationId}`,
      );
      const tipRows = Array.from(tipSettingsRows as Iterable<Record<string, unknown>>);
      const tipRow = tipRows[0];
      const sessionExpiryMinutes = (tipRow?.session_expiry_minutes as number) ?? 60;
      const tipSettingsSnapshot = tipRow
        ? {
            tipType: tipRow.tip_type as string,
            tipPresets: tipRow.tip_presets as number[],
            allowCustomTip: tipRow.allow_custom_tip as boolean,
            allowNoTip: tipRow.allow_no_tip as boolean,
            defaultTipIndex: tipRow.default_tip_index as number | null,
            tipCalculationBase: tipRow.tip_calculation_base as string,
            roundingMode: tipRow.rounding_mode as string,
            maxTipPercent: tipRow.max_tip_percent as number,
            maxTipAmountCents: tipRow.max_tip_amount_cents as number,
          }
        : {
            tipType: 'percentage',
            tipPresets: [15, 20, 25],
            allowCustomTip: true,
            allowNoTip: true,
            defaultTipIndex: null,
            tipCalculationBase: 'subtotal_pre_tax',
            roundingMode: 'nearest_cent',
            maxTipPercent: 100,
            maxTipAmountCents: 100_000,
          };

      // Supersede any existing active sessions for this order
      const activeSessions = await tx.execute(
        sql`SELECT id FROM guest_pay_sessions
            WHERE tenant_id = ${ctx.tenantId} AND tab_id = ${orderId} AND status = 'active'
            FOR UPDATE`,
      );
      const activeRows = Array.from(activeSessions as Iterable<Record<string, unknown>>);
      const events: ReturnType<typeof buildEventFromContext>[] = [];

      for (const row of activeRows) {
        const oldId = row.id as string;
        await tx.execute(
          sql`UPDATE guest_pay_sessions SET status = 'superseded', updated_at = NOW()
              WHERE id = ${oldId} AND status = 'active'`,
        );
      }

      // Generate session
      const sessionId = generateUlid();
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + sessionExpiryMinutes * 60 * 1000);

      // Generate lookup code
      let lookupCode: string | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateLookupCode();
        const conflict = await tx.execute(
          sql`SELECT 1 FROM guest_pay_sessions
              WHERE UPPER(lookup_code) = ${candidate} AND status = 'active'
              LIMIT 1`,
        );
        const conflictRows = Array.from(conflict as Iterable<Record<string, unknown>>);
        if (conflictRows.length === 0) {
          lookupCode = candidate;
          break;
        }
      }

      // Location name for display
      const locRows = await tx.execute(
        sql`SELECT name FROM locations WHERE id = ${locationId} AND tenant_id = ${ctx.tenantId}`,
      );
      const locArr = Array.from(locRows as Iterable<Record<string, unknown>>);
      const locationName = (locArr[0]?.name as string) ?? null;

      // Customer linkage
      let memberId: string | null = null;
      let memberDisplayName: string | null = null;
      let billingAccountId: string | null = null;
      const customerId = (order.customer_id as string) ?? null;

      if (customerId) {
        const memberRows = await tx.execute(
          sql`SELECT c.id, c.display_name, ba.id AS billing_account_id
              FROM customers c
              JOIN billing_account_members bam ON bam.customer_id = c.id AND bam.tenant_id = c.tenant_id
              JOIN billing_accounts ba ON ba.id = bam.billing_account_id AND ba.tenant_id = c.tenant_id
              WHERE c.id = ${customerId} AND c.tenant_id = ${ctx.tenantId}
                AND ba.status = 'active' AND bam.charge_allowed = true
              LIMIT 1`,
        );
        const mRows = Array.from(memberRows as Iterable<Record<string, unknown>>);
        if (mRows.length > 0) {
          const m = mRows[0]!;
          memberId = m.id as string;
          memberDisplayName = m.display_name as string;
          billingAccountId = m.billing_account_id as string;
        }
      }

      // Insert session — tab_id stores orderId for retail (no FK constraint)
      await tx.execute(
        sql`INSERT INTO guest_pay_sessions (
              id, tenant_id, location_id, tab_id, order_id, server_user_id,
              token, lookup_code, status,
              subtotal_cents, tax_cents, service_charge_cents, discount_cents, total_cents,
              tip_settings_snapshot,
              table_number, party_size, restaurant_name,
              member_id, member_display_name, billing_account_id,
              expires_at, created_at, updated_at
            ) VALUES (
              ${sessionId}, ${ctx.tenantId}, ${locationId}, ${orderId}, ${orderId},
              ${ctx.user.id},
              ${token}, ${lookupCode}, 'active',
              ${subtotalCents}, ${taxCents}, ${serviceChargeCents}, ${discountCents}, ${totalCents},
              ${JSON.stringify(tipSettingsSnapshot)}::jsonb,
              ${null}, ${null}, ${locationName},
              ${memberId}, ${memberDisplayName}, ${billingAccountId},
              ${expiresAt.toISOString()}::timestamptz, NOW(), NOW()
            )`,
      );

      // Audit
      const auditId = generateUlid();
      await tx.execute(
        sql`INSERT INTO guest_pay_audit_log (id, tenant_id, session_id, action, actor_type, actor_id)
            VALUES (${auditId}, ${ctx.tenantId}, ${sessionId}, 'session_created', 'staff', ${ctx.user.id})`,
      );

      // Event
      events.push(
        buildEventFromContext(ctx, 'guest_pay.session.created.v1', {
          sessionId,
          orderId,
          locationId,
          token,
          totalCents,
          expiresAt: expiresAt.toISOString(),
          source: 'retail',
        } as unknown as Record<string, unknown>),
      );

      const sessionResult = { sessionId, token, lookupCode, expiresAt: expiresAt.toISOString() };

      if (clientRequestId) {
        await saveIdempotencyKey(tx, ctx.tenantId, clientRequestId, 'createRetailGuestPay', sessionResult);
      }

      return { result: sessionResult, events };
    });

    try { await auditLog(ctx, 'guest_pay.session_created', 'guest_pay_sessions', result.sessionId as string); } catch { /* non-fatal */ }
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'orders', permission: 'orders.create', writeAccess: true },
);
