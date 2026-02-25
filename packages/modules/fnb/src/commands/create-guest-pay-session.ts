import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { generateUlid } from '@oppsera/shared';
import { generateLookupCode } from '../helpers/lookup-code';
import { FNB_EVENTS } from '../events/types';
import type { GuestPaySessionCreatedPayload, GuestPaySessionSupersededPayload } from '../events/types';
import { TabNotFoundError, TabStatusConflictError } from '../errors';
import type { CreateGuestPaySessionInput } from '../validation';

const PRESENTABLE_STATUSES = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_presented'];

export async function createGuestPaySession(
  ctx: RequestContext,
  locationId: string,
  input: CreateGuestPaySessionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createGuestPaySession');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Fetch tab (includes customerId for member linkage)
    const tabs = await tx.execute(
      sql`SELECT id, status, party_size, tab_number, server_user_id, primary_order_id, customer_id
          FROM fnb_tabs
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );
    const tabRows = Array.from(tabs as Iterable<Record<string, unknown>>);
    if (tabRows.length === 0) throw new TabNotFoundError(input.tabId);

    const tab = tabRows[0]!;
    const currentStatus = tab.status as string;

    if (!PRESENTABLE_STATUSES.includes(currentStatus)) {
      throw new TabStatusConflictError(input.tabId, currentStatus, 'create guest pay session for');
    }

    // Fetch check summary (subtotal, tax, svc charge, discount, total) from order
    const orders = await tx.execute(
      sql`SELECT subtotal_cents, tax_total_cents, service_charge_cents,
                 discount_cents, total_cents
          FROM orders
          WHERE id = ${input.orderId} AND tenant_id = ${ctx.tenantId}`,
    );
    const orderRows = Array.from(orders as Iterable<Record<string, unknown>>);
    const order = orderRows[0];
    const subtotalCents = (order?.subtotal_cents as number) ?? 0;
    const taxCents = (order?.tax_total_cents as number) ?? 0;
    const serviceChargeCents = (order?.service_charge_cents as number) ?? 0;
    const discountCents = (order?.discount_cents as number) ?? 0;
    const totalCents = (order?.total_cents as number) ?? 0;

    if (totalCents <= 0) {
      throw new TabStatusConflictError(input.tabId, currentStatus, 'create guest pay session for $0 check on');
    }

    // Fetch tip settings for this location (or use defaults)
    const tipSettingsRows = await tx.execute(
      sql`SELECT tip_type, tip_presets, allow_custom_tip, allow_no_tip,
                 default_tip_index, tip_calculation_base, rounding_mode,
                 max_tip_percent, max_tip_amount_cents, session_expiry_minutes
          FROM guest_pay_tip_settings
          WHERE tenant_id = ${ctx.tenantId} AND location_id = ${locationId}`,
    );
    const tipRows = Array.from(tipSettingsRows as Iterable<Record<string, unknown>>);
    const tipSettings = tipRows[0];

    const sessionExpiryMinutes = (tipSettings?.session_expiry_minutes as number) ?? 60;
    const tipSettingsSnapshot = tipSettings
      ? {
          tipType: tipSettings.tip_type as string,
          presets: tipSettings.tip_presets as number[],
          allowCustom: tipSettings.allow_custom_tip as boolean,
          allowNoTip: tipSettings.allow_no_tip as boolean,
          defaultTipIndex: tipSettings.default_tip_index as number | null,
          calculationBase: tipSettings.tip_calculation_base as string,
          roundingMode: tipSettings.rounding_mode as string,
          maxTipPercent: tipSettings.max_tip_percent as number,
          maxTipAmountCents: tipSettings.max_tip_amount_cents as number,
        }
      : {
          tipType: 'percentage',
          presets: [15, 20, 25],
          allowCustom: true,
          allowNoTip: true,
          defaultTipIndex: null,
          calculationBase: 'subtotal_pre_tax',
          roundingMode: 'nearest_cent',
          maxTipPercent: 100,
          maxTipAmountCents: 100_000,
        };

    // Supersede any active sessions for this tab
    const events: Array<ReturnType<typeof buildEventFromContext>> = [];

    const activeSessions = await tx.execute(
      sql`SELECT id FROM guest_pay_sessions
          WHERE tenant_id = ${ctx.tenantId} AND tab_id = ${input.tabId} AND status = 'active'
          FOR UPDATE`,
    );
    const activeRows = Array.from(activeSessions as Iterable<Record<string, unknown>>);

    const sessionId = generateUlid();

    for (const row of activeRows) {
      const oldId = row.id as string;
      await tx.execute(
        sql`UPDATE guest_pay_sessions
            SET status = 'superseded', superseded_by_id = ${sessionId}, updated_at = NOW()
            WHERE id = ${oldId}`,
      );

      // Audit supersede
      const auditId = generateUlid();
      await tx.execute(
        sql`INSERT INTO guest_pay_audit_log (id, tenant_id, session_id, action, actor_type, actor_id)
            VALUES (${auditId}, ${ctx.tenantId}, ${oldId}, 'session_superseded', 'staff', ${ctx.user.id})`,
      );

      const supersededPayload: GuestPaySessionSupersededPayload = {
        oldSessionId: oldId,
        newSessionId: sessionId,
        tabId: input.tabId,
        locationId,
      };
      events.push(
        buildEventFromContext(ctx, FNB_EVENTS.GUEST_PAY_SESSION_SUPERSEDED, supersededPayload as unknown as Record<string, unknown>),
      );
    }

    // Generate secure token
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + sessionExpiryMinutes * 60 * 1000);

    // Generate human-readable lookup code (retry on collision with active sessions)
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

    // Fetch restaurant name from location
    const locRows = await tx.execute(
      sql`SELECT name FROM locations WHERE id = ${locationId} AND tenant_id = ${ctx.tenantId}`,
    );
    const locArr = Array.from(locRows as Iterable<Record<string, unknown>>);
    const restaurantName = (locArr[0]?.name as string) ?? null;

    // Path A: if tab has a customerId, look up member billing info
    let memberId: string | null = null;
    let memberDisplayName: string | null = null;
    let billingAccountId: string | null = null;

    const tabCustomerId = (tab.customer_id as string) ?? null;
    if (tabCustomerId) {
      const memberRows = await tx.execute(
        sql`SELECT c.id, c.display_name, ba.id AS billing_account_id
            FROM customers c
            JOIN billing_account_members bam ON bam.customer_id = c.id AND bam.tenant_id = c.tenant_id
            JOIN billing_accounts ba ON ba.id = bam.billing_account_id AND ba.tenant_id = c.tenant_id
            WHERE c.id = ${tabCustomerId} AND c.tenant_id = ${ctx.tenantId}
              AND ba.status = 'active' AND bam.charge_allowed = true
            LIMIT 1`,
      );
      const memberArr = Array.from(memberRows as Iterable<Record<string, unknown>>);
      if (memberArr.length > 0) {
        const m = memberArr[0]!;
        memberId = m.id as string;
        memberDisplayName = m.display_name as string;
        billingAccountId = m.billing_account_id as string;
      }
    }

    // Insert new session
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
            ${sessionId}, ${ctx.tenantId}, ${locationId}, ${input.tabId}, ${input.orderId},
            ${(tab.server_user_id as string) ?? null},
            ${token}, ${lookupCode}, 'active',
            ${subtotalCents}, ${taxCents}, ${serviceChargeCents}, ${discountCents}, ${totalCents},
            ${JSON.stringify(tipSettingsSnapshot)}::jsonb,
            ${String(tab.tab_number ?? '')}, ${(tab.party_size as number) ?? null}, ${restaurantName},
            ${memberId}, ${memberDisplayName}, ${billingAccountId},
            ${expiresAt.toISOString()}::timestamptz, NOW(), NOW()
          )`,
    );

    // Audit session creation
    const auditId = generateUlid();
    await tx.execute(
      sql`INSERT INTO guest_pay_audit_log (id, tenant_id, session_id, action, actor_type, actor_id)
          VALUES (${auditId}, ${ctx.tenantId}, ${sessionId}, 'session_created', 'staff', ${ctx.user.id})`,
    );

    // Update tab status to check_presented if not already
    if (currentStatus !== 'check_presented') {
      await tx.execute(
        sql`UPDATE fnb_tabs
            SET status = 'check_presented', updated_at = NOW(), version = version + 1
            WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
      );
    }

    const payload: GuestPaySessionCreatedPayload = {
      sessionId,
      tabId: input.tabId,
      orderId: input.orderId,
      locationId,
      token,
      totalCents,
      expiresAt: expiresAt.toISOString(),
      serverUserId: (tab.server_user_id as string) ?? null,
    };
    events.push(
      buildEventFromContext(ctx, FNB_EVENTS.GUEST_PAY_SESSION_CREATED, payload as unknown as Record<string, unknown>),
    );

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createGuestPaySession', {
        sessionId,
        token,
        lookupCode,
        expiresAt: expiresAt.toISOString(),
      });
    }

    return {
      result: { sessionId, token, lookupCode, expiresAt: expiresAt.toISOString() },
      events,
    };
  });

  await auditLog(ctx, 'fnb.guestpay.session_created', 'guest_pay_sessions', result.sessionId);
  return result;
}
