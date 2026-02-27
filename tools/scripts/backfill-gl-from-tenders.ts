/**
 * One-off script: For each tenant with accounting settings, find tenders that have
 * no corresponding GL journal entry and post them via the POS posting adapter.
 *
 * Idempotent via unique index on (tenant_id, source_module, source_reference_id).
 *
 * Usage:
 *   pnpm tsx tools/scripts/backfill-gl-from-tenders.ts
 *
 * Options:
 *   --dry-run     Log what would be posted without actually posting
 *   --remote      Use production DATABASE_URL from .env.remote
 *   --tenant=ID   Only process a specific tenant
 *   --limit=N     Max tenders to process per tenant (default: 1000)
 */
import dotenv from 'dotenv';

const args = process.argv.slice(2);
const useRemote = args.includes('--remote');

if (useRemote) {
  dotenv.config({ path: '.env.remote', override: true });
} else {
  dotenv.config({ path: '.env.local' });
  dotenv.config();
}

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { setAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { AccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';

const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const client = postgres(connectionString, { max: 2, prepare: false });
const db = drizzle(client);

// Parse CLI flags
const dryRun = args.includes('--dry-run');
const tenantArg = args.find((a) => a.startsWith('--tenant='))?.split('=')[1];
const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
const LIMIT = limitArg ? parseInt(limitArg, 10) : 1000;

/**
 * Initialize the AccountingPostingApi singleton so the POS adapter
 * can post GL entries. Required before calling handleTenderForAccounting.
 */
async function initPostingApi() {
  const { postJournalEntry, getAccountBalances, getAccountingSettings } =
    await import('@oppsera/module-accounting');

  const api: AccountingPostingApi = {
    postEntry: async (ctx, input) => {
      const result = await postJournalEntry(ctx, {
        businessDate: input.businessDate,
        sourceModule: input.sourceModule,
        sourceReferenceId: input.sourceReferenceId,
        memo: input.memo,
        currency: input.currency,
        lines: input.lines,
        forcePost: input.forcePost,
      }, { hasControlAccountPermission: true });
      return { id: result.id, journalNumber: result.journalNumber, status: result.status };
    },
    getAccountBalance: async (tenantId, accountId, asOfDate) => {
      const balances = await getAccountBalances({ tenantId, accountIds: [accountId], asOfDate });
      return balances[0]?.balance ?? 0;
    },
    getSettings: async (tenantId) => {
      const settings = await getAccountingSettings(db, tenantId);
      return {
        defaultAPControlAccountId: settings?.defaultAPControlAccountId ?? null,
        defaultARControlAccountId: settings?.defaultARControlAccountId ?? null,
        baseCurrency: settings?.baseCurrency ?? 'USD',
        enableLegacyGlPosting: settings?.enableLegacyGlPosting ?? true,
      };
    },
  };

  setAccountingPostingApi(api);
  console.log('AccountingPostingApi initialized\n');
}

async function main() {
  console.log(`Backfill GL from tenders${dryRun ? ' (DRY RUN)' : ''}${useRemote ? ' (REMOTE)' : ' (LOCAL)'}`);
  console.log(`Limit per tenant: ${LIMIT}`);

  // 0. Initialize the AccountingPostingApi singleton (required by POS adapter)
  if (!dryRun) {
    await initPostingApi();
  }

  // 1. Find tenants with accounting_settings OR GL accounts (covers non-bootstrap setup)
  const tenantFilter = tenantArg ? sql` AND tenant_id = ${tenantArg}` : sql``;
  const tenantsResult = await db.execute(sql`
    SELECT DISTINCT sub.tenant_id, t.name AS tenant_name
    FROM (
      SELECT tenant_id FROM accounting_settings WHERE 1=1 ${tenantFilter}
      UNION
      SELECT tenant_id FROM gl_accounts WHERE 1=1 ${tenantFilter}
    ) sub
    JOIN tenants t ON t.id = sub.tenant_id
  `);
  const tenants = Array.from(tenantsResult as Iterable<Record<string, unknown>>);
  console.log(`Found ${tenants.length} tenant(s) with accounting settings or GL accounts\n`);

  let totalPosted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Lazy import ensureAccountingSettings (module may not be built yet in all envs)
  const { ensureAccountingSettings } = await import(
    '@oppsera/module-accounting'
  );

  for (const tenant of tenants) {
    const tenantId = String(tenant.tenant_id);
    const tenantName = String(tenant.tenant_name);
    console.log(`── Tenant: ${tenantName} (${tenantId}) ──`);

    // Ensure accounting_settings row exists (auto-creates + auto-wires fallback accounts)
    if (!dryRun) {
      try {
        const { created, autoWired } = await ensureAccountingSettings(db as any, tenantId);
        if (created) {
          console.log(`  Auto-created accounting_settings (auto-wired ${autoWired} fallback account(s))`);
        }
      } catch (err) {
        console.warn(`  Warning: could not ensure accounting_settings: ${err instanceof Error ? err.message : err}`);
      }
    }

    // 2. Find tenders with no corresponding GL journal entry
    const unpostedResult = await db.execute(sql`
      SELECT t.id AS tender_id,
             t.order_id,
             t.tender_type,
             t.amount,
             t.tip_amount,
             t.business_date,
             t.location_id,
             t.terminal_id,
             t.tender_sequence,
             o.total AS order_total,
             o.subtotal,
             o.tax_total,
             o.discount_total,
             o.service_charge_total,
             o.customer_id
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
      ORDER BY t.created_at ASC
      LIMIT ${LIMIT}
    `);
    const unposted = Array.from(unpostedResult as Iterable<Record<string, unknown>>);

    if (unposted.length === 0) {
      console.log(`  No unposted tenders found\n`);
      continue;
    }
    console.log(`  Found ${unposted.length} unposted tender(s)`);

    // Determine if this is the final tender for each order
    const orderTenderCounts = new Map<string, { total: number; cumulative: number }>();

    for (const t of unposted) {
      const orderId = String(t.order_id);
      const orderTotal = Number(t.order_total);

      if (!orderTenderCounts.has(orderId)) {
        // Count all tenders for this order
        const countResult = await db.execute(sql`
          SELECT COUNT(*) AS cnt, SUM(amount) AS total_tendered
          FROM tenders
          WHERE tenant_id = ${tenantId}
            AND order_id = ${orderId}
            AND status = 'captured'
        `);
        const countRows = Array.from(countResult as Iterable<Record<string, unknown>>);
        const totalTendered = Number(countRows[0]?.total_tendered ?? 0);
        orderTenderCounts.set(orderId, { total: orderTotal, cumulative: totalTendered });
      }
    }

    for (const t of unposted) {
      const tenderId = String(t.tender_id);
      const orderId = String(t.order_id);
      const tenderAmount = Number(t.amount);
      const orderTotal = Number(t.order_total);
      const orderInfo = orderTenderCounts.get(orderId)!;
      const isFullyPaid = orderInfo.cumulative >= orderInfo.total;

      // 3. Load order lines for this tender's order
      const linesResult = await db.execute(sql`
        SELECT catalog_item_id,
               catalog_item_name,
               sub_department_id,
               qty,
               line_subtotal,
               tax_group_id,
               line_tax,
               cost_price,
               package_components
        FROM order_lines
        WHERE tenant_id = ${tenantId}
          AND order_id = ${orderId}
      `);
      const lines = Array.from(linesResult as Iterable<Record<string, unknown>>);

      const enrichedLines = lines.map((l) => ({
        catalogItemId: String(l.catalog_item_id ?? ''),
        catalogItemName: String(l.catalog_item_name ?? ''),
        subDepartmentId: l.sub_department_id ? String(l.sub_department_id) : null,
        qty: Number(l.qty ?? 1),
        extendedPriceCents: Number(l.line_subtotal ?? 0),
        taxGroupId: l.tax_group_id ? String(l.tax_group_id) : null,
        taxAmountCents: Number(l.line_tax ?? 0),
        costCents: l.cost_price != null ? Number(l.cost_price) : null,
        packageComponents: l.package_components ?? null,
      }));

      if (dryRun) {
        console.log(`  [DRY RUN] Would post tender ${tenderId} ($${(tenderAmount / 100).toFixed(2)}) for order ${orderId} (${enrichedLines.length} lines, fullyPaid=${isFullyPaid})`);
        totalSkipped++;
        continue;
      }

      // 4. Reconstruct event payload and call handleTenderForAccounting
      try {
        // Lazy import to avoid loading module before DB is ready
        const { handleTenderForAccounting } = await import(
          '@oppsera/module-accounting'
        );

        const syntheticEvent = {
          id: `backfill-${tenderId}`,
          type: 'tender.recorded.v1',
          tenantId,
          data: {
            tenderId,
            orderId,
            tenantId,
            locationId: String(t.location_id ?? ''),
            tenderType: String(t.tender_type ?? 'cash'),
            paymentMethod: String(t.tender_type ?? 'cash'),
            amount: tenderAmount,
            tipAmount: Number(t.tip_amount ?? 0),
            orderTotal,
            subtotal: Number(t.subtotal ?? 0),
            taxTotal: Number(t.tax_total ?? 0),
            discountTotal: Number(t.discount_total ?? 0),
            serviceChargeTotal: Number(t.service_charge_total ?? 0),
            totalTendered: orderInfo.cumulative,
            isFullyPaid,
            customerId: t.customer_id ? String(t.customer_id) : null,
            terminalId: t.terminal_id ? String(t.terminal_id) : null,
            tenderSequence: Number(t.tender_sequence ?? 1),
            businessDate: String(t.business_date),
            lines: enrichedLines,
          },
          occurredAt: new Date().toISOString(),
        };

        await handleTenderForAccounting(syntheticEvent);
        totalPosted++;
        console.log(`  Posted tender ${tenderId} ($${(tenderAmount / 100).toFixed(2)})`);
      } catch (err) {
        totalErrors++;
        console.error(`  ERROR posting tender ${tenderId}:`, err instanceof Error ? err.message : err);
      }
    }
    console.log('');
  }

  console.log(`\n── Summary ──`);
  console.log(`Posted:  ${totalPosted}`);
  console.log(`Skipped: ${totalSkipped}`);
  console.log(`Errors:  ${totalErrors}`);

  await client.end();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
