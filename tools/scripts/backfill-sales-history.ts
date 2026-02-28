/**
 * Backfill script: Populates new columns on existing `rm_revenue_activity` rows.
 *
 * For POS orders (source='pos_order'):
 *   - source_sub_type: 'pos_retail' or 'pos_fnb' (detected via orders.primary_order_id)
 *   - reference_number: order number
 *   - customer_id, employee_id, employee_name: from orders + users
 *   - subtotal/tax/discount/service_charge: from orders (cents → dollars)
 *   - payment_method: from tenders (multiple → 'split')
 *   - tip_dollars: SUM of tenders tip amounts
 *
 * For PMS folio entries (source='pms_folio'):
 *   - source_sub_type: 'pms_folio'
 *   - reference_number: 'F-{folioIdShort}'
 *   - customer_id: from folio → guest → customer
 *
 * Safe to run multiple times — uses UPDATE (not INSERT), only sets NULL columns.
 *
 * Usage:
 *   pnpm tsx tools/scripts/backfill-sales-history.ts              # local DB
 *   pnpm tsx tools/scripts/backfill-sales-history.ts --remote      # production DB
 */
import dotenv from 'dotenv';

const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '.env.remote', override: true });
}
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import postgres from 'postgres';

const BATCH_SIZE = 500;

async function main() {
  const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_ADMIN or DATABASE_URL is required');
  }

  console.log(`Connecting to ${isRemote ? 'REMOTE' : 'LOCAL'} database...`);
  const client = postgres(connectionString, { max: 1, prepare: false });

  try {
    // ------------------------------------------------------------------
    // Phase 1: Backfill POS order rows (source = 'pos_order')
    // ------------------------------------------------------------------
    console.log('\n=== Phase 1: POS Orders ===');

    // Count rows needing backfill (source_sub_type is NULL)
    const posCountResult = await client`
      SELECT COUNT(*) AS cnt
      FROM rm_revenue_activity
      WHERE source = 'pos_order' AND source_sub_type IS NULL
    `;
    const posTotal = Number(posCountResult[0]?.cnt ?? 0);
    console.log(`Found ${posTotal} POS rows needing backfill`);

    if (posTotal > 0) {
      let posUpdated = 0;

      // Process in batches using cursor on rm_revenue_activity.id
      let lastId: string | null = null;

      while (true) {
        // Fetch a batch of rm_revenue_activity rows that need enrichment
        const batch = lastId
          ? await client`
              SELECT ra.id, ra.source_id, ra.tenant_id
              FROM rm_revenue_activity ra
              WHERE ra.source = 'pos_order'
                AND ra.source_sub_type IS NULL
                AND ra.id > ${lastId}
              ORDER BY ra.id
              LIMIT ${BATCH_SIZE}
            `
          : await client`
              SELECT ra.id, ra.source_id, ra.tenant_id
              FROM rm_revenue_activity ra
              WHERE ra.source = 'pos_order'
                AND ra.source_sub_type IS NULL
              ORDER BY ra.id
              LIMIT ${BATCH_SIZE}
            `;

        if (batch.length === 0) break;

        const raIds = batch.map((r) => String(r.id));
        const sourceIds = batch.map((r) => String(r.source_id));
        lastId = String(batch[batch.length - 1]!.id);

        // Fetch matching orders with employee names
        const orderData = await client`
          SELECT
            o.id AS order_id,
            o.order_number,
            o.customer_id,
            o.employee_id,
            COALESCE(u.name, u.email) AS employee_name,
            o.subtotal,
            o.tax_total,
            o.discount_total,
            o.service_charge_total,
            CASE WHEN o.primary_order_id IS NOT NULL THEN 'pos_fnb' ELSE 'pos_retail' END AS sub_type
          FROM orders o
          LEFT JOIN users u ON o.employee_id = u.id
          WHERE o.id = ANY(${sourceIds})
        `;

        // Build lookup: orderId → order data
        const orderMap = new Map<string, (typeof orderData)[0]>();
        for (const o of orderData) {
          orderMap.set(String(o.order_id), o);
        }

        // Fetch tender aggregates per order
        const tenderData = await client`
          SELECT
            t.order_id,
            COUNT(*) AS tender_count,
            SUM(t.tip_amount) AS total_tip_cents,
            MIN(t.tender_type) AS first_tender_type,
            CASE WHEN COUNT(DISTINCT t.tender_type) > 1 THEN 'split' ELSE MIN(t.tender_type) END AS payment_method
          FROM tenders t
          WHERE t.order_id = ANY(${sourceIds})
          GROUP BY t.order_id
        `;

        const tenderMap = new Map<string, (typeof tenderData)[0]>();
        for (const t of tenderData) {
          tenderMap.set(String(t.order_id), t);
        }

        // Update each rm_revenue_activity row
        for (const ra of batch) {
          const raId = String(ra.id);
          const sourceId = String(ra.source_id);
          const order = orderMap.get(sourceId);
          const tender = tenderMap.get(sourceId);

          const subType = order ? String(order.sub_type) : 'pos_retail';
          const refNum = order ? String(order.order_number) : null;
          const custId = order?.customer_id ? String(order.customer_id) : null;
          const empId = order?.employee_id ? String(order.employee_id) : null;
          const empName = order?.employee_name ? String(order.employee_name) : null;
          const subtotalDollars = order ? (Number(order.subtotal) / 100).toFixed(4) : '0';
          const taxDollars = order ? (Number(order.tax_total) / 100).toFixed(4) : '0';
          const discountDollars = order ? (Number(order.discount_total) / 100).toFixed(4) : '0';
          const svcChargeDollars = order ? (Number(order.service_charge_total) / 100).toFixed(4) : '0';
          const paymentMethod = tender ? String(tender.payment_method) : null;
          const tipDollars = tender ? (Number(tender.total_tip_cents) / 100).toFixed(4) : '0';

          await client`
            UPDATE rm_revenue_activity
            SET
              source_sub_type = ${subType},
              reference_number = COALESCE(reference_number, ${refNum}),
              customer_id = COALESCE(customer_id, ${custId}),
              employee_id = COALESCE(employee_id, ${empId}),
              employee_name = COALESCE(employee_name, ${empName}),
              subtotal_dollars = COALESCE(NULLIF(subtotal_dollars, 0), ${subtotalDollars}::numeric),
              tax_dollars = COALESCE(NULLIF(tax_dollars, 0), ${taxDollars}::numeric),
              discount_dollars = COALESCE(NULLIF(discount_dollars, 0), ${discountDollars}::numeric),
              service_charge_dollars = COALESCE(NULLIF(service_charge_dollars, 0), ${svcChargeDollars}::numeric),
              payment_method = COALESCE(payment_method, ${paymentMethod}),
              tip_dollars = COALESCE(NULLIF(tip_dollars, 0), ${tipDollars}::numeric)
            WHERE id = ${raId}
          `;
        }

        posUpdated += batch.length;
        console.log(`  Updated ${posUpdated}/${posTotal} POS rows...`);
      }

      console.log(`Phase 1 complete: ${posUpdated} POS rows enriched`);
    }

    // ------------------------------------------------------------------
    // Phase 2: Backfill PMS folio rows (source = 'pms_folio')
    // ------------------------------------------------------------------
    console.log('\n=== Phase 2: PMS Folio Entries ===');

    const folioCountResult = await client`
      SELECT COUNT(*) AS cnt
      FROM rm_revenue_activity
      WHERE source = 'pms_folio' AND source_sub_type IS NULL
    `;
    const folioTotal = Number(folioCountResult[0]?.cnt ?? 0);
    console.log(`Found ${folioTotal} folio rows needing backfill`);

    if (folioTotal > 0) {
      let folioUpdated = 0;
      let lastFolioId: string | null = null;

      while (true) {
        const batch = lastFolioId
          ? await client`
              SELECT ra.id, ra.source_id, ra.tenant_id
              FROM rm_revenue_activity ra
              WHERE ra.source = 'pms_folio'
                AND ra.source_sub_type IS NULL
                AND ra.id > ${lastFolioId}
              ORDER BY ra.id
              LIMIT ${BATCH_SIZE}
            `
          : await client`
              SELECT ra.id, ra.source_id, ra.tenant_id
              FROM rm_revenue_activity ra
              WHERE ra.source = 'pms_folio'
                AND ra.source_sub_type IS NULL
              ORDER BY ra.id
              LIMIT ${BATCH_SIZE}
            `;

        if (batch.length === 0) break;

        const sourceIds = batch.map((r) => String(r.source_id));
        lastFolioId = String(batch[batch.length - 1]!.id);

        // Fetch folio entry → folio → guest mapping
        const folioData = await client`
          SELECT
            fe.id AS entry_id,
            f.id AS folio_id,
            SUBSTRING(f.id FROM 1 FOR 8) AS folio_short,
            g.customer_id,
            CONCAT(COALESCE(g.first_name, ''), ' ', COALESCE(g.last_name, '')) AS guest_name
          FROM pms_folio_entries fe
          JOIN pms_folios f ON fe.folio_id = f.id
          LEFT JOIN pms_guests g ON f.guest_id = g.id
          WHERE fe.id = ANY(${sourceIds})
        `;

        const folioMap = new Map<string, (typeof folioData)[0]>();
        for (const f of folioData) {
          folioMap.set(String(f.entry_id), f);
        }

        for (const ra of batch) {
          const raId = String(ra.id);
          const sourceId = String(ra.source_id);
          const folio = folioMap.get(sourceId);

          const refNum = folio ? `F-${String(folio.folio_short)}` : null;
          const custId = folio?.customer_id ? String(folio.customer_id) : null;

          await client`
            UPDATE rm_revenue_activity
            SET
              source_sub_type = 'pms_folio',
              reference_number = COALESCE(reference_number, ${refNum}),
              customer_id = COALESCE(customer_id, ${custId})
            WHERE id = ${raId}
          `;
        }

        folioUpdated += batch.length;
        console.log(`  Updated ${folioUpdated}/${folioTotal} folio rows...`);
      }

      console.log(`Phase 2 complete: ${folioUpdated} folio rows enriched`);
    }

    // ------------------------------------------------------------------
    // Phase 3: Backfill any remaining sources (ar_invoice, membership, voucher)
    // ------------------------------------------------------------------
    console.log('\n=== Phase 3: Other Sources ===');

    // For remaining sources, just set source_sub_type = source where NULL
    const otherResult = await client`
      UPDATE rm_revenue_activity
      SET source_sub_type = source
      WHERE source_sub_type IS NULL
        AND source NOT IN ('pos_order', 'pms_folio')
      RETURNING id
    `;
    console.log(`Set source_sub_type for ${otherResult.length} other rows`);

    // ------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------
    console.log('\n=== Summary ===');
    const summary = await client`
      SELECT
        COALESCE(source_sub_type, source) AS effective_source,
        COUNT(*) AS cnt,
        SUM(CASE WHEN source_sub_type IS NOT NULL THEN 1 ELSE 0 END) AS enriched,
        SUM(CASE WHEN reference_number IS NOT NULL THEN 1 ELSE 0 END) AS has_ref,
        SUM(CASE WHEN payment_method IS NOT NULL THEN 1 ELSE 0 END) AS has_payment
      FROM rm_revenue_activity
      GROUP BY COALESCE(source_sub_type, source)
      ORDER BY cnt DESC
    `;

    console.log('Source              | Count | Enriched | Has Ref# | Has Payment');
    console.log('-'.repeat(72));
    for (const row of summary) {
      const src = String(row.effective_source).padEnd(19);
      const cnt = String(row.cnt).padStart(5);
      const enriched = String(row.enriched).padStart(8);
      const hasRef = String(row.has_ref).padStart(8);
      const hasPay = String(row.has_payment).padStart(11);
      console.log(`${src} | ${cnt} | ${enriched} | ${hasRef} | ${hasPay}`);
    }

    console.log('\nBackfill complete.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
