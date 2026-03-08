/**
 * GL Backfill — Direct DB script (bypasses Vercel 30s timeout)
 *
 * Posts GL journal entries for tenders missing GL coverage.
 * Mirrors the POS posting adapter logic with proportional allocation.
 * Idempotent: checks existence before insert.
 *
 * Usage:
 *   node tools/scripts/gl-backfill-remote.cjs              # Count only
 *   node tools/scripts/gl-backfill-remote.cjs --run         # Run backfill
 *   node tools/scripts/gl-backfill-remote.cjs --tenant=ID   # Specific tenant
 *   node tools/scripts/gl-backfill-remote.cjs --local --run  # Run against local DB
 */
const dotenv = require('dotenv');
const isLocal = process.argv.includes('--local');
if (isLocal) {
  dotenv.config({ path: '.env.local' });
  dotenv.config();
} else {
  dotenv.config({ path: '.env.remote', override: true });
}

const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set. Ensure .env.remote exists.');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 10 });

// Simple ULID generator
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateUlid() {
  const now = Date.now();
  let time = '';
  let t = now;
  for (let i = 9; i >= 0; i--) {
    time = ENCODING[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let random = '';
  for (let i = 0; i < 16; i++) {
    random += ENCODING[Math.floor(Math.random() * 32)];
  }
  return time + random;
}

const args = process.argv.slice(2);
const doRun = args.includes('--run');
const tenantArg = args.find(a => a.startsWith('--tenant='))?.split('=')[1];
const BATCH_SIZE = 500;

async function main() {
  console.log(`GL Backfill Script (${doRun ? 'EXECUTE' : 'COUNT ONLY'}) — Remote DB\n`);

  const tenantFilter = tenantArg ? sql`AND s.tenant_id = ${tenantArg}` : sql``;
  const tenants = await sql`
    SELECT DISTINCT s.tenant_id, t.name AS tenant_name
    FROM accounting_settings s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE 1=1 ${tenantFilter}
    ORDER BY t.name
  `;

  console.log(`Found ${tenants.length} tenant(s) with accounting settings\n`);
  let grandTotalUnposted = 0;

  for (const tenant of tenants) {
    const { tenant_id: tenantId, tenant_name: tenantName } = tenant;
    console.log(`── ${tenantName} (${tenantId}) ──`);

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM tenders t
      WHERE t.tenant_id = ${tenantId}
        AND t.status = 'captured'
        AND NOT EXISTS (
          SELECT 1 FROM gl_journal_entries gje
          WHERE gje.tenant_id = ${tenantId}
            AND gje.source_module = 'pos'
            AND gje.source_reference_id = t.id
        )
    `;

    console.log(`  Unposted tenders: ${count}`);
    grandTotalUnposted += count;

    if (!doRun || count === 0) continue;

    // Load settings
    const [settings] = await sql`
      SELECT default_uncategorized_revenue_account_id,
             default_undeposited_funds_account_id,
             default_sales_tax_payable_account_id,
             default_tips_payable_account_id,
             default_service_charge_revenue_account_id,
             default_rounding_account_id,
             default_credit_card_receivable_account_id,
             enable_legacy_gl_posting,
             base_currency
      FROM accounting_settings
      WHERE tenant_id = ${tenantId} LIMIT 1
    `;

    if (!settings || settings.enable_legacy_gl_posting) {
      console.log(settings ? '  Legacy GL — skipping' : '  No settings — skipping');
      continue;
    }

    const revAcct = settings.default_uncategorized_revenue_account_id;
    const depositAcct = settings.default_undeposited_funds_account_id;
    const taxAcct = settings.default_sales_tax_payable_account_id;
    const tipAcct = settings.default_tips_payable_account_id;
    const roundAcct = settings.default_rounding_account_id;
    const cardAcct = settings.default_credit_card_receivable_account_id;
    const currency = settings.base_currency || 'USD';

    if (!revAcct || !depositAcct) {
      console.log('  Missing revenue or deposit account — skipping');
      continue;
    }

    // Load mappings
    const subDeptRows = await sql`SELECT sub_department_id, revenue_account_id FROM sub_department_gl_defaults WHERE tenant_id = ${tenantId}`;
    const subDeptMap = new Map(subDeptRows.map(r => [r.sub_department_id, r.revenue_account_id]));

    const taxRows = await sql`SELECT tax_group_id, tax_payable_account_id FROM tax_group_gl_defaults WHERE tenant_id = ${tenantId}`;
    const taxMap = new Map(taxRows.map(r => [r.tax_group_id, r.tax_payable_account_id]));

    const ptRows = await sql`SELECT payment_type_id, cash_account_id FROM payment_type_gl_defaults WHERE tenant_id = ${tenantId}`;
    const ptMap = new Map(ptRows.map(r => [r.payment_type_id, r.cash_account_id]));

    console.log(`  Mappings: ${subDeptMap.size} sub-depts, ${taxMap.size} tax groups, ${ptMap.size} payment types`);

    let cursor = null;
    let totalPosted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let batch = 0;

    while (true) {
      batch++;
      const cursorFilter = cursor ? sql`AND t.id > ${cursor}` : sql``;

      const unposted = await sql`
        SELECT t.id AS tender_id, t.order_id, t.tender_type, t.amount,
               t.tip_amount, t.business_date, t.location_id,
               o.total AS order_total, o.subtotal, o.tax_total,
               o.service_charge_total
        FROM tenders t
        JOIN orders o ON o.id = t.order_id AND o.tenant_id = t.tenant_id
        WHERE t.tenant_id = ${tenantId}
          AND t.status = 'captured'
          AND NOT EXISTS (
            SELECT 1 FROM gl_journal_entries gje
            WHERE gje.tenant_id = ${tenantId}
              AND gje.source_module = 'pos'
              AND gje.source_reference_id = t.id
          )
          ${cursorFilter}
        ORDER BY t.id ASC
        LIMIT ${BATCH_SIZE}
      `;

      if (unposted.length === 0) break;
      console.log(`  Batch ${batch}: ${unposted.length} tenders...`);

      // Pre-load order lines
      const orderIds = [...new Set(unposted.map(t => t.order_id))];
      const orderLines = await sql`
        SELECT order_id, sub_department_id, line_subtotal, tax_group_id, line_tax
        FROM order_lines
        WHERE tenant_id = ${tenantId} AND order_id IN ${sql(orderIds)}
      `;
      const linesMap = new Map();
      for (const line of orderLines) {
        if (!linesMap.has(line.order_id)) linesMap.set(line.order_id, []);
        linesMap.get(line.order_id).push(line);
      }

      // Build all entries for this batch, then bulk-insert in a single transaction
      const allJournalEntries = [];
      const allJournalLines = [];

      for (const t of unposted) {
        cursor = t.tender_id;
        const amtC = Number(t.amount);
        const tipC = Number(t.tip_amount ?? 0);
        const ordC = Number(t.order_total);
        const bizDate = String(t.business_date).slice(0, 10);
        const tType = t.tender_type || 'cash';
        const lines = linesMap.get(t.order_id) ?? [];

        if (ordC <= 0) { totalSkipped++; continue; }

        const ratio = amtC / ordC;
        if (!Number.isFinite(ratio) || ratio < 0) { totalSkipped++; continue; }

        // Resolve deposit account
        let depAcct = ptMap.get(tType) || null;
        if (!depAcct) {
          depAcct = ['credit_card', 'debit_card'].includes(tType)
            ? (cardAcct || depositAcct) : depositAcct;
        }
        if (!depAcct) { totalSkipped++; continue; }

        const gl = [];

        // DEBIT: deposit account
        gl.push({ acct: depAcct, dr: ((amtC + tipC) / 100).toFixed(2), cr: '0', loc: t.location_id, sd: null, memo: `POS ${tType}` });

        // CREDIT: revenue by sub-department
        if (lines.length > 0) {
          const revBySd = new Map();
          const taxByGrp = new Map();
          for (const l of lines) {
            const sd = l.sub_department_id || '_';
            const sub = Number(l.line_subtotal ?? 0) * ratio;
            revBySd.set(sd, (revBySd.get(sd) || 0) + sub);
            if (l.tax_group_id && l.line_tax) {
              const tx = Number(l.line_tax) * ratio;
              taxByGrp.set(l.tax_group_id, (taxByGrp.get(l.tax_group_id) || 0) + tx);
            }
          }
          for (const [sd, c] of revBySd) {
            const r = Math.round(c);
            if (r <= 0) continue;
            const a = (sd !== '_' && subDeptMap.get(sd)) || revAcct;
            gl.push({ acct: a, dr: '0', cr: (r / 100).toFixed(2), loc: t.location_id, sd: sd !== '_' ? sd : null, memo: 'Revenue' });
          }
          for (const [gid, c] of taxByGrp) {
            const r = Math.round(c);
            if (r <= 0) continue;
            const a = taxMap.get(gid) || taxAcct;
            if (a) gl.push({ acct: a, dr: '0', cr: (r / 100).toFixed(2), loc: t.location_id, sd: null, memo: 'Sales tax' });
          }
        } else {
          gl.push({ acct: revAcct, dr: '0', cr: (amtC / 100).toFixed(2), loc: t.location_id, sd: null, memo: 'Revenue' });
        }

        // Service charge
        const svcC = Math.round(Number(t.service_charge_total ?? 0) * ratio);
        if (svcC > 0) {
          const a = settings.default_service_charge_revenue_account_id || revAcct;
          gl.push({ acct: a, dr: '0', cr: (svcC / 100).toFixed(2), loc: t.location_id, sd: null, memo: 'Service charge' });
        }

        // Tips
        if (tipC > 0 && tipAcct) {
          gl.push({ acct: tipAcct, dr: '0', cr: (tipC / 100).toFixed(2), loc: t.location_id, sd: null, memo: 'Tips payable' });
        }

        // Balance
        let dSum = 0, cSum = 0;
        for (const g of gl) { dSum += Math.round(Number(g.dr) * 100); cSum += Math.round(Number(g.cr) * 100); }
        const imb = dSum - cSum;
        if (imb !== 0) {
          const bAcct = roundAcct || revAcct;
          if (imb > 0) gl.push({ acct: bAcct, dr: '0', cr: (imb / 100).toFixed(2), loc: null, sd: null, memo: 'Rounding' });
          else gl.push({ acct: bAcct, dr: (Math.abs(imb) / 100).toFixed(2), cr: '0', loc: null, sd: null, memo: 'Rounding' });
        }

        if (gl.length < 2) { totalSkipped++; continue; }

        const jeId = generateUlid();
        allJournalEntries.push({
          id: jeId,
          tenant_id: tenantId,
          business_date: bizDate,
          source_reference_id: t.tender_id,
          memo: `Backfill: POS ${tType} tender`,
          posting_period: bizDate.slice(0, 7),
          location_id: t.location_id,
        });

        for (let i = 0; i < gl.length; i++) {
          const g = gl[i];
          if (Number(g.dr) === 0 && Number(g.cr) === 0) continue;
          allJournalLines.push({
            id: generateUlid(),
            journal_entry_id: jeId,
            tenant_id: tenantId,
            account_id: g.acct,
            debit_amount: g.dr,
            credit_amount: g.cr,
            location_id: g.loc,
            sub_department_id: g.sd,
            memo: g.memo,
            sort_order: i + 1,
          });
        }
      }

      if (allJournalEntries.length === 0) {
        console.log(`    Nothing to insert this batch`);
        if (unposted.length < BATCH_SIZE) break;
        continue;
      }

      // Bulk insert in a single transaction
      try {
        await sql.begin(async (tx) => {
          // Reserve journal numbers
          const [{ last_number: startNum }] = await tx`
            INSERT INTO gl_journal_number_counters (tenant_id, last_number)
            VALUES (${tenantId}, ${allJournalEntries.length})
            ON CONFLICT (tenant_id) DO UPDATE
            SET last_number = gl_journal_number_counters.last_number + ${allJournalEntries.length}
            RETURNING last_number
          `;
          const baseNum = startNum - allJournalEntries.length + 1;

          // Bulk insert journal entries
          const jeRows = allJournalEntries.map((je, i) => ({
            id: je.id,
            tenant_id: je.tenant_id,
            journal_number: baseNum + i,
            business_date: je.business_date,
            source_module: 'pos',
            source_reference_id: je.source_reference_id,
            status: 'posted',
            memo: je.memo,
            currency,
            posting_period: je.posting_period,
            created_by: 'system:gl-backfill',
            posted_at: new Date().toISOString(),
          }));

          // Insert in chunks of 100 to avoid query size limits
          for (let i = 0; i < jeRows.length; i += 100) {
            const chunk = jeRows.slice(i, i + 100);
            await tx`
              INSERT INTO gl_journal_entries ${tx(chunk,
                'id', 'tenant_id', 'journal_number', 'business_date', 'source_module',
                'source_reference_id', 'status', 'memo', 'currency', 'posting_period',
                'created_by', 'posted_at'
              )}
            `;
          }

          // Bulk insert journal lines
          const jlRows = allJournalLines.map(jl => ({
            id: jl.id,
            journal_entry_id: jl.journal_entry_id,
            tenant_id: jl.tenant_id,
            account_id: jl.account_id,
            debit_amount: jl.debit_amount,
            credit_amount: jl.credit_amount,
            location_id: jl.location_id,
            sub_department_id: jl.sub_department_id,
            memo: jl.memo,
            sort_order: jl.sort_order,
            channel: 'pos',
          }));

          for (let i = 0; i < jlRows.length; i += 100) {
            const chunk = jlRows.slice(i, i + 100);
            await tx`
              INSERT INTO gl_journal_lines ${tx(chunk,
                'id', 'journal_entry_id', 'tenant_id', 'account_id',
                'debit_amount', 'credit_amount', 'location_id',
                'sub_department_id', 'memo', 'sort_order', 'channel'
              )}
            `;
          }
        });

        totalPosted += allJournalEntries.length;
      } catch (err) {
        if (err.code === '23505') {
          // Duplicate — fall back to one-by-one for this batch
          console.log(`    Duplicate detected in batch — retrying individually...`);
          for (let i = 0; i < allJournalEntries.length; i++) {
            const je = allJournalEntries[i];
            const myLines = allJournalLines.filter(jl => jl.journal_entry_id === je.id);
            try {
              const existing = await sql`
                SELECT 1 FROM gl_journal_entries
                WHERE tenant_id = ${tenantId} AND source_module = 'pos'
                  AND source_reference_id = ${je.source_reference_id} AND status <> 'voided'
                LIMIT 1
              `;
              if (existing.length > 0) { totalSkipped++; continue; }

              const [{ last_number: jn }] = await sql`
                INSERT INTO gl_journal_number_counters (tenant_id, last_number)
                VALUES (${tenantId}, 1)
                ON CONFLICT (tenant_id) DO UPDATE
                SET last_number = gl_journal_number_counters.last_number + 1
                RETURNING last_number
              `;

              await sql.begin(async (tx) => {
                await tx`
                  INSERT INTO gl_journal_entries (id, tenant_id, journal_number, business_date, source_module,
                    source_reference_id, status, memo, currency, posting_period, created_by, posted_at)
                  VALUES (${je.id}, ${tenantId}, ${jn}, ${je.business_date}::date, 'pos',
                    ${je.source_reference_id}, 'posted', ${je.memo}, ${currency},
                    ${je.posting_period}, 'system:gl-backfill', ${new Date().toISOString()})
                `;
                for (const jl of myLines) {
                  await tx`
                    INSERT INTO gl_journal_lines (id, journal_entry_id, tenant_id, account_id,
                      debit_amount, credit_amount, location_id, sub_department_id, memo, sort_order, channel)
                    VALUES (${jl.id}, ${jl.journal_entry_id}, ${tenantId}, ${jl.account_id},
                      ${jl.debit_amount}, ${jl.credit_amount}, ${jl.location_id}, ${jl.sub_department_id},
                      ${jl.memo}, ${jl.sort_order}, 'pos')
                  `;
                }
              });
              totalPosted++;
            } catch (e2) {
              if (e2.code === '23505') totalSkipped++;
              else { totalErrors++; if (totalErrors <= 5) console.log(`    ERROR ${je.source_reference_id}: ${e2.message}`); }
            }
          }
        } else {
          totalErrors += allJournalEntries.length;
          console.log(`    BATCH ERROR: ${err.message}`);
        }
      }

      console.log(`    Totals: posted=${totalPosted} skipped=${totalSkipped} errors=${totalErrors}`);
      if (unposted.length < BATCH_SIZE) break;
    }

    console.log(`  DONE: posted=${totalPosted} skipped=${totalSkipped} errors=${totalErrors}\n`);
  }

  console.log(`\n── Grand Total Unposted: ${grandTotalUnposted} ──`);
  if (!doRun && grandTotalUnposted > 0) console.log('Run with --run to execute the backfill');

  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
