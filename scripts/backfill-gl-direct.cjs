/**
 * Direct GL Backfill — bypasses Vercel API routes entirely.
 *
 * Connects to Supabase, loads all mappings once, then bulk-inserts
 * GL journal entries for all unposted POS tenders. Runs locally
 * with no timeout constraints.
 *
 * Idempotent: uses ON CONFLICT DO NOTHING on the idempotency key.
 *
 * Usage:
 *   node scripts/backfill-gl-direct.cjs                  # full run
 *   node scripts/backfill-gl-direct.cjs --dry-run        # preview only
 *   node scripts/backfill-gl-direct.cjs --limit 500      # cap at 500 tenders
 *   node scripts/backfill-gl-direct.cjs --tenant <id>    # specific tenant
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const postgres = require('postgres');
const crypto = require('crypto');

const connStr = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connStr) {
  console.error('ERROR: DATABASE_URL not set. Check .env.remote or .env.local');
  process.exit(1);
}
const sql = postgres(connStr, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 15 });

// ── CLI args ──
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const maxTenders = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : 0;
const tenantIdx = args.indexOf('--tenant');
const specificTenant = tenantIdx >= 0 && args[tenantIdx + 1] ? args[tenantIdx + 1] : null;

function ulid() {
  const t = Date.now();
  const ts = t.toString(32).padStart(10, '0');
  const rand = crypto.randomBytes(10).toString('hex').slice(0, 16);
  // Simple ULID-like: timestamp prefix + random suffix (26 chars, sortable)
  const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let result = '';
  // Encode timestamp (48 bits = 10 chars in base32)
  let remaining = t;
  for (let i = 9; i >= 0; i--) {
    result = ENCODING[remaining % 32] + result;
    remaining = Math.floor(remaining / 32);
  }
  // Encode 16 random chars
  const rb = crypto.randomBytes(10);
  for (let i = 0; i < 16; i++) {
    result += ENCODING[rb[i % 10] % 32];
  }
  return result.slice(0, 26);
}

// ── Main ──
async function main() {
  console.log('=== GL Direct Backfill ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (maxTenders) console.log(`Limit: ${maxTenders} tenders`);
  if (specificTenant) console.log(`Tenant: ${specificTenant}`);
  console.log('');

  // 1. Get tenant(s) to process
  const tenants = specificTenant
    ? await sql`SELECT id, name FROM tenants WHERE id = ${specificTenant}`
    : await sql`SELECT id, name FROM tenants WHERE status = 'active' ORDER BY name`;

  if (tenants.length === 0) {
    console.log('No tenants found.');
    return;
  }
  console.log(`Processing ${tenants.length} tenant(s)...\n`);

  let grandTotal = { entries: 0, lines: 0, skipped: 0, errors: 0 };

  for (const tenant of tenants) {
    console.log(`\n── Tenant: ${tenant.name} (${tenant.id}) ──`);

    try {
      const result = await processTenant(tenant.id);
      grandTotal.entries += result.entries;
      grandTotal.lines += result.lines;
      grandTotal.skipped += result.skipped;
      grandTotal.errors += result.errors;
    } catch (err) {
      console.error(`  ERROR processing tenant ${tenant.name}: ${err.message}`);
      grandTotal.errors++;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`  Journal entries created: ${grandTotal.entries}`);
  console.log(`  Journal lines created:   ${grandTotal.lines}`);
  console.log(`  Skipped (zero/dup):      ${grandTotal.skipped}`);
  console.log(`  Errors:                  ${grandTotal.errors}`);
}

async function processTenant(tenantId) {
  const stats = { entries: 0, lines: 0, skipped: 0, errors: 0 };

  // 1. Load accounting settings
  const [settings] = await sql`
    SELECT * FROM accounting_settings WHERE tenant_id = ${tenantId} LIMIT 1
  `;
  if (!settings) {
    console.log('  No accounting settings — skipping');
    return stats;
  }

  // 2. Load all GL mappings upfront
  const paymentMappings = await sql`
    SELECT payment_type_id, cash_account_id, clearing_account_id
    FROM payment_type_gl_defaults
    WHERE tenant_id = ${tenantId}
  `;
  const paymentMap = new Map();
  for (const m of paymentMappings) {
    paymentMap.set(m.payment_type_id, m);
  }

  const subDeptMappings = await sql`
    SELECT sub_department_id, revenue_account_id, discount_account_id,
           cogs_account_id, inventory_asset_account_id
    FROM sub_department_gl_defaults
    WHERE tenant_id = ${tenantId}
  `;
  const subDeptMap = new Map();
  for (const m of subDeptMappings) {
    subDeptMap.set(m.sub_department_id, m);
  }

  const taxMappings = await sql`
    SELECT tax_group_id, tax_payable_account_id
    FROM tax_group_gl_defaults
    WHERE tenant_id = ${tenantId}
  `;
  const taxMap = new Map();
  for (const m of taxMappings) {
    taxMap.set(m.tax_group_id, m);
  }

  // Fallback accounts
  const defaultCashAcct = settings.default_undeposited_funds_account_id;
  const defaultRevenueAcct = settings.default_uncategorized_revenue_account_id;
  const defaultTaxAcct = settings.default_sales_tax_payable_account_id;
  const defaultTipsAcct = settings.default_tips_payable_account_id;
  const defaultServiceChargeAcct = settings.default_service_charge_revenue_account_id || defaultRevenueAcct;
  const defaultSurchargeAcct = settings.default_surcharge_revenue_account_id || defaultRevenueAcct;
  const defaultDiscountAcct = settings.default_discount_account_id || defaultRevenueAcct;
  const defaultRoundingAcct = settings.default_rounding_account_id;
  const currency = settings.base_currency || 'USD';
  const useClearing = settings.enable_undeposited_funds_workflow === true;

  if (!defaultCashAcct && !defaultRevenueAcct) {
    console.log('  No default accounts configured — skipping');
    return stats;
  }

  // 3. Find unposted tenders (no GL entry exists)
  const limitClause = maxTenders > 0 ? sql`LIMIT ${maxTenders}` : sql``;
  const unpostedTenders = await sql`
    SELECT t.id AS tender_id,
           t.order_id,
           t.amount,
           t.tender_type,
           t.tip_amount,
           COALESCE(t.surcharge_amount_cents, 0) AS surcharge_amount_cents,
           t.location_id,
           t.terminal_id,
           t.business_date,
           o.customer_id,
           o.total AS order_total,
           o.subtotal,
           o.tax_total,
           o.discount_total,
           o.service_charge_total
    FROM tenders t
    JOIN orders o ON o.id = t.order_id AND o.tenant_id = t.tenant_id
    WHERE t.tenant_id = ${tenantId}
      AND t.status = 'captured'
      AND o.total > 0
      AND NOT EXISTS (
        SELECT 1 FROM gl_journal_entries gje
        WHERE gje.tenant_id = ${tenantId}
          AND gje.source_module = 'pos'
          AND gje.source_reference_id = t.id
      )
    ORDER BY t.created_at ASC
    ${limitClause}
  `;

  console.log(`  Found ${unpostedTenders.length} unposted tenders`);
  if (unpostedTenders.length === 0) return stats;

  // 4. Load order lines for these orders
  const orderIds = [...new Set(unpostedTenders.map(t => t.order_id))];
  const orderLines = await sql`
    SELECT order_id, sub_department_id, tax_group_id,
           extended_price_cents, line_tax,
           COALESCE(cost_price, 0) AS cost_price
    FROM order_lines
    WHERE tenant_id = ${tenantId}
      AND order_id = ANY(${orderIds})
  `;
  // Group lines by order
  const linesByOrder = new Map();
  for (const l of orderLines) {
    if (!linesByOrder.has(l.order_id)) linesByOrder.set(l.order_id, []);
    linesByOrder.get(l.order_id).push(l);
  }

  // 5. Calculate tender totals per order (for split-tender ratio)
  const tenderTotals = await sql`
    SELECT order_id, SUM(amount)::int AS total_tendered
    FROM tenders
    WHERE tenant_id = ${tenantId}
      AND order_id = ANY(${orderIds})
      AND status = 'captured'
    GROUP BY order_id
  `;
  const tenderTotalMap = new Map();
  for (const t of tenderTotals) {
    tenderTotalMap.set(t.order_id, Number(t.total_tendered));
  }

  // 6. Process in batches of 200
  const BATCH_SIZE = 200;
  for (let i = 0; i < unpostedTenders.length; i += BATCH_SIZE) {
    const batch = unpostedTenders.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(unpostedTenders.length / BATCH_SIZE);
    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} tenders)...`);

    if (dryRun) {
      stats.entries += batch.length;
      console.log(' [dry run]');
      continue;
    }

    try {
      const batchResult = await sql.begin(async (tx) => {
        let batchEntries = 0;
        let batchLines = 0;
        let batchSkipped = 0;

        for (const tender of batch) {
          try {
            const result = await insertGlEntry(tx, tenantId, tender, {
              settings, paymentMap, subDeptMap, taxMap,
              defaultCashAcct, defaultRevenueAcct, defaultTaxAcct,
              defaultTipsAcct, defaultServiceChargeAcct, defaultSurchargeAcct,
              defaultDiscountAcct, defaultRoundingAcct,
              currency, useClearing,
              linesByOrder, tenderTotalMap,
            });
            if (result.inserted) {
              batchEntries++;
              batchLines += result.lineCount;
            } else {
              batchSkipped++;
            }
          } catch (err) {
            // Log but continue — one bad tender shouldn't kill the batch
            if (err.code === '23505') {
              // Unique violation = already exists, skip
              batchSkipped++;
            } else {
              console.error(`\n    Error on tender ${tender.tender_id}: ${err.message}`);
              stats.errors++;
            }
          }
        }
        return { batchEntries, batchLines, batchSkipped };
      });

      stats.entries += batchResult.batchEntries;
      stats.lines += batchResult.batchLines;
      stats.skipped += batchResult.batchSkipped;
      console.log(` ${batchResult.batchEntries} entries, ${batchResult.batchLines} lines`);
    } catch (err) {
      console.error(` BATCH ERROR: ${err.message}`);
      stats.errors += batch.length;
    }
  }

  return stats;
}

async function insertGlEntry(tx, tenantId, tender, ctx) {
  const {
    settings, paymentMap, subDeptMap, taxMap,
    defaultCashAcct, defaultRevenueAcct, defaultTaxAcct,
    defaultTipsAcct, defaultServiceChargeAcct, defaultSurchargeAcct,
    defaultDiscountAcct, defaultRoundingAcct,
    currency, useClearing, linesByOrder, tenderTotalMap,
  } = ctx;

  const tenderId = tender.tender_id;
  const orderId = tender.order_id;
  const tenderAmount = Number(tender.amount || 0);
  const tipAmount = Number(tender.tip_amount || 0);
  const surchargeAmount = Number(tender.surcharge_amount_cents || 0);
  const orderTotal = Number(tender.order_total || 0);
  const taxTotal = Number(tender.tax_total || 0);
  const discountTotal = Number(tender.discount_total || 0);
  const serviceChargeTotal = Number(tender.service_charge_total || 0);

  if (orderTotal === 0 || tenderAmount === 0) {
    return { inserted: false, lineCount: 0 };
  }

  // Split-tender ratio
  const totalTendered = tenderTotalMap.get(orderId) || tenderAmount;
  const tenderRatio = totalTendered > 0 ? tenderAmount / totalTendered : 1;

  const lines = [];
  let sortOrder = 0;

  // ── Line 1: DEBIT — Cash/Clearing ──
  const paymentType = tender.tender_type || 'unknown';
  const ptMapping = paymentMap.get(paymentType);
  const cashAccountId = (useClearing && ptMapping?.clearing_account_id)
    ? ptMapping.clearing_account_id
    : (ptMapping?.cash_account_id || defaultCashAcct);

  if (!cashAccountId) {
    return { inserted: false, lineCount: 0 };
  }

  const debitTotalCents = tenderAmount + tipAmount + surchargeAmount;
  lines.push({
    account_id: cashAccountId,
    debit_amount: (debitTotalCents / 100).toFixed(2),
    credit_amount: '0.00',
    location_id: tender.location_id,
    terminal_id: tender.terminal_id,
    customer_id: tender.customer_id || null,
    channel: 'pos',
    memo: `${paymentType} tender`,
    sort_order: sortOrder++,
  });

  // ── Lines 2: CREDIT — Revenue by sub-department ──
  const orderLinesList = linesByOrder.get(orderId) || [];
  const revenueBySubDept = new Map();
  const taxByGroup = new Map();

  for (const line of orderLinesList) {
    const subDeptId = line.sub_department_id || 'unmapped';
    const cents = Number(line.extended_price_cents || 0);
    revenueBySubDept.set(subDeptId, (revenueBySubDept.get(subDeptId) || 0) + cents);

    if (line.tax_group_id && Number(line.line_tax || 0) > 0) {
      const taxCents = Number(line.line_tax);
      taxByGroup.set(line.tax_group_id, (taxByGroup.get(line.tax_group_id) || 0) + taxCents);
    }
  }

  // If no order lines found, create a single revenue line from order total
  if (revenueBySubDept.size === 0) {
    const revCents = orderTotal - taxTotal - discountTotal;
    revenueBySubDept.set('unmapped', Math.max(0, revCents));
    if (taxTotal > 0) taxByGroup.set('default', taxTotal);
  }

  // Revenue lines
  for (const [subDeptId, totalCents] of revenueBySubDept) {
    const proportionalCents = Math.round(totalCents * tenderRatio);
    if (proportionalCents <= 0) continue;

    const subDeptMapping = subDeptMap.get(subDeptId);
    const revenueAccountId = subDeptMapping?.revenue_account_id || defaultRevenueAcct;
    if (!revenueAccountId) continue;

    lines.push({
      account_id: revenueAccountId,
      debit_amount: '0.00',
      credit_amount: (proportionalCents / 100).toFixed(2),
      location_id: tender.location_id,
      terminal_id: tender.terminal_id,
      sub_department_id: subDeptId !== 'unmapped' ? subDeptId : null,
      channel: 'pos',
      memo: subDeptId !== 'unmapped' ? `Revenue - ${subDeptId}` : 'Revenue - uncategorized',
      sort_order: sortOrder++,
    });
  }

  // ── Discount lines (DEBIT) ──
  if (discountTotal > 0 && tenderRatio > 0) {
    const discountCents = Math.round(discountTotal * tenderRatio);
    if (discountCents > 0 && defaultDiscountAcct) {
      lines.push({
        account_id: defaultDiscountAcct,
        debit_amount: (discountCents / 100).toFixed(2),
        credit_amount: '0.00',
        location_id: tender.location_id,
        terminal_id: tender.terminal_id,
        channel: 'pos',
        memo: 'Discount',
        sort_order: sortOrder++,
      });
    }
  }

  // ── Tax lines (CREDIT) ──
  for (const [taxGroupId, totalCents] of taxByGroup) {
    const proportionalCents = Math.round(totalCents * tenderRatio);
    if (proportionalCents <= 0) continue;

    const taxMapping = taxMap.get(taxGroupId);
    const taxAccountId = taxMapping?.tax_payable_account_id || defaultTaxAcct;
    if (!taxAccountId) continue;

    lines.push({
      account_id: taxAccountId,
      debit_amount: '0.00',
      credit_amount: (proportionalCents / 100).toFixed(2),
      location_id: tender.location_id,
      terminal_id: tender.terminal_id,
      channel: 'pos',
      memo: `Tax - ${taxGroupId}`,
      sort_order: sortOrder++,
    });
  }

  // ── Service charge (CREDIT) ──
  if (serviceChargeTotal > 0 && tenderRatio > 0) {
    const scCents = Math.round(serviceChargeTotal * tenderRatio);
    if (scCents > 0 && defaultServiceChargeAcct) {
      lines.push({
        account_id: defaultServiceChargeAcct,
        debit_amount: '0.00',
        credit_amount: (scCents / 100).toFixed(2),
        location_id: tender.location_id,
        terminal_id: tender.terminal_id,
        channel: 'pos',
        memo: 'Service charge',
        sort_order: sortOrder++,
      });
    }
  }

  // ── Surcharge (CREDIT, per-tender not proportional) ──
  if (surchargeAmount > 0 && defaultSurchargeAcct) {
    lines.push({
      account_id: defaultSurchargeAcct,
      debit_amount: '0.00',
      credit_amount: (surchargeAmount / 100).toFixed(2),
      location_id: tender.location_id,
      terminal_id: tender.terminal_id,
      channel: 'pos',
      memo: 'Surcharge',
      sort_order: sortOrder++,
    });
  }

  // ── Tips (CREDIT, per-tender not proportional) ──
  if (tipAmount > 0 && defaultTipsAcct) {
    lines.push({
      account_id: defaultTipsAcct,
      debit_amount: '0.00',
      credit_amount: (tipAmount / 100).toFixed(2),
      location_id: tender.location_id,
      terminal_id: tender.terminal_id,
      channel: 'pos',
      memo: 'Tips payable',
      sort_order: sortOrder++,
    });
  }

  // ── Rounding adjustment ──
  let totalDebits = 0;
  let totalCredits = 0;
  for (const l of lines) {
    totalDebits += parseFloat(l.debit_amount);
    totalCredits += parseFloat(l.credit_amount);
  }
  const diff = Math.round((totalDebits - totalCredits) * 100) / 100;
  if (Math.abs(diff) >= 0.01 && defaultRoundingAcct) {
    if (diff > 0) {
      // Over-debited — credit the rounding account
      lines.push({
        account_id: defaultRoundingAcct,
        debit_amount: '0.00',
        credit_amount: diff.toFixed(2),
        location_id: tender.location_id,
        terminal_id: tender.terminal_id,
        channel: 'pos',
        memo: 'Rounding adjustment',
        sort_order: sortOrder++,
      });
    } else {
      // Under-debited — debit the rounding account
      lines.push({
        account_id: defaultRoundingAcct,
        debit_amount: Math.abs(diff).toFixed(2),
        credit_amount: '0.00',
        location_id: tender.location_id,
        terminal_id: tender.terminal_id,
        channel: 'pos',
        memo: 'Rounding adjustment',
        sort_order: sortOrder++,
      });
    }
  } else if (Math.abs(diff) >= 0.01 && !defaultRoundingAcct) {
    // No rounding account — adjust the last credit line
    const lastCredit = [...lines].reverse().find(l => parseFloat(l.credit_amount) > 0);
    if (lastCredit) {
      const adjusted = parseFloat(lastCredit.credit_amount) + diff;
      if (adjusted > 0) lastCredit.credit_amount = adjusted.toFixed(2);
    }
  }

  // ── Get next journal number ──
  const [counter] = await tx`
    INSERT INTO gl_journal_number_counters (tenant_id, last_number)
    VALUES (${tenantId}, 1)
    ON CONFLICT (tenant_id) DO UPDATE SET last_number = gl_journal_number_counters.last_number + 1
    RETURNING last_number
  `;
  const journalNumber = counter.last_number;

  // ── Insert journal entry ──
  const entryId = ulid();
  const businessDate = tender.business_date
    ? (typeof tender.business_date === 'string' ? tender.business_date : new Date(tender.business_date).toISOString().slice(0, 10))
    : new Date().toISOString().slice(0, 10);
  const postingPeriod = businessDate.slice(0, 7);

  await tx`
    INSERT INTO gl_journal_entries (
      id, tenant_id, journal_number, source_module, source_reference_id,
      business_date, posting_period, currency, transaction_currency, exchange_rate,
      status, memo, posted_at, source_idempotency_key, created_by
    ) VALUES (
      ${entryId}, ${tenantId}, ${journalNumber}, 'pos', ${tenderId},
      ${businessDate}::date, ${postingPeriod}, ${currency}, ${currency}, '1.000000',
      'posted', ${'POS Sale - Order ' + orderId}, NOW(), ${'pos:tender:' + tenderId}, 'system'
    )
    ON CONFLICT ON CONSTRAINT uq_gl_journal_idempotency_key DO NOTHING
  `;

  // Check if actually inserted (ON CONFLICT might have skipped)
  const [check] = await tx`
    SELECT id FROM gl_journal_entries WHERE id = ${entryId} AND tenant_id = ${tenantId}
  `;
  if (!check) {
    return { inserted: false, lineCount: 0 };
  }

  // ── Insert journal lines ──
  for (const line of lines) {
    const lineId = ulid();
    await tx`
      INSERT INTO gl_journal_entry_lines (
        id, tenant_id, journal_entry_id, account_id,
        debit_amount, credit_amount, location_id, terminal_id,
        sub_department_id, customer_id, channel, memo, sort_order
      ) VALUES (
        ${lineId}, ${tenantId}, ${entryId}, ${line.account_id},
        ${line.debit_amount}::numeric, ${line.credit_amount}::numeric,
        ${line.location_id || null}, ${line.terminal_id || null},
        ${line.sub_department_id || null}, ${line.customer_id || null},
        ${line.channel}, ${line.memo || null}, ${line.sort_order}
      )
    `;
  }

  return { inserted: true, lineCount: lines.length };
}

main()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nFATAL:', err);
    process.exit(1);
  });
