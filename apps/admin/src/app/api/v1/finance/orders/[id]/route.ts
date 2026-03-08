import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';
import { sqlArray } from '@oppsera/db';

// ── GET /api/v1/finance/orders/[id] — Full order detail aggregation ──

export const GET = withAdminPermission(
  async (_req, _session, params) => {
    const orderId = params?.id;
    if (!orderId || typeof orderId !== 'string' || orderId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(orderId)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Order ID is required and must be a valid identifier' } },
        { status: 400 },
      );
    }

    const result = await withAdminDb(async (tx) => {
      // 1. Main order with tenant, location, customer, employee names
      const orderRows = await tx.execute(sql`
        SELECT
          o.*,
          t.name AS tenant_name,
          l.name AS location_name,
          c.display_name AS customer_name,
          c.email AS customer_email,
          c.phone AS customer_phone,
          u.display_name AS employee_name,
          vb.display_name AS voided_by_name
        FROM orders o
        LEFT JOIN tenants t ON t.id = o.tenant_id
        LEFT JOIN locations l ON l.id = o.location_id
        LEFT JOIN customers c ON c.id = o.customer_id AND c.tenant_id = o.tenant_id
        LEFT JOIN users u ON u.id = o.employee_id AND u.tenant_id = o.tenant_id
        LEFT JOIN users vb ON vb.id = o.voided_by AND vb.tenant_id = o.tenant_id
        WHERE o.id = ${orderId}
        LIMIT 1
      `);

      const orderItems = Array.from(orderRows as Iterable<Record<string, unknown>>);
      if (orderItems.length === 0) {
        return null;
      }
      const order = orderItems[0]!;

      // 2. Order lines
      const lineRows = await tx.execute(sql`
        SELECT
          ol.id,
          ol.catalog_item_id,
          ol.catalog_item_name,
          ol.catalog_item_sku,
          ol.item_type,
          ol.qty,
          ol.unit_price,
          ol.original_unit_price,
          ol.line_subtotal,
          ol.line_tax,
          ol.line_total,
          ol.modifiers,
          ol.special_instructions,
          ol.selected_options,
          ol.sub_department_id,
          ol.tax_group_id,
          ol.price_override_reason,
          ol.price_overridden_by,
          ol.sort_order,
          ol.created_at
        FROM order_lines ol
        WHERE ol.order_id = ${orderId}
        ORDER BY ol.sort_order ASC
      `);
      const lines = Array.from(lineRows as Iterable<Record<string, unknown>>);

      // 3. Tenders with card info and reversals LEFT JOINed
      const tenderRows = await tx.execute(sql`
        SELECT
          td.id,
          td.tender_type,
          td.tender_sequence,
          td.amount,
          td.tip_amount,
          td.change_given,
          td.amount_given,
          td.surcharge_amount_cents,
          td.status,
          td.business_date,
          td.source,
          td.card_last4,
          td.card_brand,
          td.provider_ref,
          td.employee_id,
          td.terminal_id,
          td.pos_mode,
          td.created_at,
          eu.display_name AS employee_name,
          tr.id AS reversal_id,
          tr.reversal_type,
          tr.amount AS reversal_amount,
          tr.reason AS reversal_reason,
          tr.status AS reversal_status,
          tr.created_at AS reversal_created_at,
          ru.display_name AS reversal_created_by_name
        FROM tenders td
        LEFT JOIN users eu ON eu.id = td.employee_id AND eu.tenant_id = td.tenant_id
        LEFT JOIN tender_reversals tr ON tr.original_tender_id = td.id
        LEFT JOIN users ru ON ru.id = tr.created_by AND ru.tenant_id = tr.tenant_id
        WHERE td.order_id = ${orderId}
        ORDER BY td.tender_sequence ASC
      `);
      const tenders = Array.from(tenderRows as Iterable<Record<string, unknown>>);

      // 4. GL journal entries for this order (source_module = 'pos', source_reference_id = orderId)
      const glRows = await tx.execute(sql`
        SELECT
          je.id,
          je.journal_number,
          je.source_module,
          je.business_date,
          je.posting_period,
          je.status,
          je.memo,
          je.posted_at,
          je.voided_at,
          je.void_reason,
          je.created_at
        FROM gl_journal_entries je
        WHERE je.source_module = 'pos'
          AND je.source_reference_id = ${orderId}
        ORDER BY je.created_at ASC
      `);
      const journalEntries = Array.from(glRows as Iterable<Record<string, unknown>>);

      // 4b. GL journal lines for those entries
      const jeIds = journalEntries.map((je) => je.id as string);
      let journalLines: Record<string, unknown>[] = [];
      if (jeIds.length > 0) {
        const glLineRows = await tx.execute(sql`
          SELECT
            jl.id,
            jl.journal_entry_id,
            jl.account_id,
            jl.debit_amount,
            jl.credit_amount,
            jl.location_id,
            jl.department_id,
            jl.memo,
            jl.sort_order,
            ga.account_number,
            ga.name AS account_name,
            ga.account_type
          FROM gl_journal_lines jl
          LEFT JOIN gl_accounts ga ON ga.id = jl.account_id
          WHERE jl.journal_entry_id = ANY(${sqlArray(jeIds as string[])})
          ORDER BY jl.sort_order ASC
        `);
        journalLines = Array.from(glLineRows as Iterable<Record<string, unknown>>);
      }

      // Nest lines under their journal entries
      const glEntries = journalEntries.map((je) => ({
        ...je,
        lines: journalLines.filter((jl) => jl.journal_entry_id === je.id),
      }));

      // 5. Audit trail
      const auditRows = await tx.execute(sql`
        SELECT
          al.id,
          al.action,
          al.entity_type,
          al.entity_id,
          al.actor_user_id,
          al.actor_type,
          al.changes,
          al.metadata,
          al.created_at,
          u.display_name AS actor_name
        FROM audit_log al
        LEFT JOIN users u ON u.id = al.actor_user_id AND u.tenant_id = al.tenant_id
        WHERE al.entity_type = 'order'
          AND al.entity_id = ${orderId}
        ORDER BY al.created_at ASC
      `);
      const auditTrail = Array.from(auditRows as Iterable<Record<string, unknown>>);

      // 6. Build timeline from lifecycle events
      const timeline: { event: string; timestamp: unknown; actor?: unknown }[] = [];

      if (order.created_at) {
        timeline.push({ event: 'created', timestamp: order.created_at, actor: order.employee_name });
      }
      if (order.placed_at) {
        timeline.push({ event: 'placed', timestamp: order.placed_at, actor: order.employee_name });
      }
      if (order.paid_at) {
        timeline.push({ event: 'paid', timestamp: order.paid_at });
      }
      if (order.voided_at) {
        timeline.push({
          event: 'voided',
          timestamp: order.voided_at,
          actor: order.voided_by_name,
        });
      }

      // Add tender events to timeline
      for (const t of tenders) {
        timeline.push({
          event: `tender_${t.tender_type}`,
          timestamp: t.created_at,
          actor: t.employee_name,
        });
        if (t.reversal_id) {
          timeline.push({
            event: `tender_${t.reversal_type}`,
            timestamp: t.reversal_created_at,
            actor: t.reversal_created_by_name,
          });
        }
      }

      // Sort timeline chronologically
      timeline.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp as string).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp as string).getTime() : 0;
        return ta - tb;
      });

      return {
        order,
        lines,
        tenders,
        glEntries,
        auditTrail,
        timeline,
      };
    });

    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result });
  },
  { permission: 'tenants.read' },
);
