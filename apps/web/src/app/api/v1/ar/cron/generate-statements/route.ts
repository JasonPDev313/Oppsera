import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { withDistributedLock } from '@oppsera/core';
import { generateUlid, LOCK_KEYS } from '@oppsera/shared';

/** Max accounts per cron run — sequential processing on Vercel (pool max: 2). */
const ACCOUNT_CAP = 100;
/** Bail out if wall-clock exceeds this (Vercel Pro function timeout = 60s). */
const TIME_BUDGET_MS = 55_000;
const LOG_PREFIX = '[ar-statements]';

/**
 * POST /api/v1/ar/cron/generate-statements
 *
 * Monthly Vercel Cron that generates billing account statements for house accounts.
 *
 * CMAA requirement: members receive periodic statements showing charges, payments,
 * and running balance. Runs on the 1st of each month (or configurable per account).
 *
 * For each active billing account where statement_day_of_month matches today:
 *  1. Calculates period (previous month)
 *  2. Sums charges (AR invoices) and payments (AR receipts) for the period
 *  3. Creates a billing_account_statements row
 *  4. Updates status to 'finalized'
 *
 * Auth: CRON_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
  const startMs = Date.now();
  const now = new Date();

  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error(`${LOG_PREFIX} CRON_SECRET is not configured`);
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lockResult = await withDistributedLock(
      LOCK_KEYS.AR_STATEMENT_GENERATION,
      23 * 60 * 60 * 1000,
      async () => generateStatements(startMs, now),
      { trigger: 'vercel-cron' },
    );

    if (lockResult === null) {
      return NextResponse.json({
        data: {
          ranAt: now.toISOString(),
          durationMs: Date.now() - startMs,
          generatedCount: 0,
          skipped: 'Lock held by another instance',
        },
      });
    }

    return NextResponse.json({
      data: {
        ranAt: now.toISOString(),
        durationMs: Date.now() - startMs,
        ...lockResult,
      },
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Unhandled error:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

async function generateStatements(startMs: number, now: Date) {
  const today = now.getDate();

  // Period: previous calendar month
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
  const periodStartStr = periodStart.toISOString().split('T')[0]!;
  const periodEndStr = periodEnd.toISOString().split('T')[0]!;

  // Find active billing accounts where statement day matches today
  // (or default to 1st if no statement_day_of_month is set)
  const rows = await db.execute(sql`
    SELECT ba.id AS billing_account_id,
           ba.tenant_id,
           ba.primary_customer_id,
           ba.name AS account_name,
           ba.current_balance_cents,
           ba.due_days,
           COALESCE(ba.statement_day_of_month, 1) AS statement_day
    FROM billing_accounts ba
    JOIN tenants t ON t.id = ba.tenant_id AND t.status = 'active'
    WHERE ba.status = 'active'
      AND ba.account_type = 'house'
      AND COALESCE(ba.statement_day_of_month, 1) = ${today}
      AND NOT EXISTS (
        SELECT 1 FROM billing_account_statements s
        WHERE s.tenant_id = ba.tenant_id
          AND s.billing_account_id = ba.id
          AND s.period_start = ${periodStartStr}
          AND s.period_end = ${periodEndStr}
      )
    ORDER BY ba.tenant_id, ba.id
    LIMIT ${ACCOUNT_CAP + 1}
  `);

  const accounts = Array.from(rows as Iterable<Record<string, unknown>>);
  const capped = accounts.length > ACCOUNT_CAP;
  if (capped) accounts.pop();

  if (accounts.length === 0) {
    console.log(`${LOG_PREFIX} No accounts need statements today (day ${today})`);
    return { generatedCount: 0, errorCount: 0, capped: false };
  }

  console.log(`${LOG_PREFIX} Generating statements for ${accounts.length} account(s)`);

  let generatedCount = 0;
  let errorCount = 0;

  for (const acct of accounts) {
    if (Date.now() - startMs > TIME_BUDGET_MS) {
      console.warn(`${LOG_PREFIX} Time budget exhausted after ${generatedCount} statements`);
      break;
    }

    const accountId = acct.billing_account_id as string;
    const tenantId = acct.tenant_id as string;
    const customerId = acct.primary_customer_id as string;
    const dueDays = Number(acct.due_days ?? 30);

    try {
      // Calculate charges and payments for the period from AR invoices/receipts
      const totalsResult = await db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'charge' THEN amount ELSE 0 END), 0)::bigint AS charges_cents,
          COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0)::bigint AS payments_cents
        FROM (
          SELECT ROUND(total_amount * 100)::bigint AS amount, 'charge' AS type
          FROM ar_invoices
          WHERE tenant_id = ${tenantId}
            AND billing_account_id = ${accountId}
            AND invoice_date >= ${periodStartStr}
            AND invoice_date <= ${periodEndStr}
            AND status != 'voided'
          UNION ALL
          SELECT ROUND(amount * 100)::bigint, 'payment' AS type
          FROM ar_receipts
          WHERE tenant_id = ${tenantId}
            AND customer_id = ${customerId}
            AND receipt_date >= ${periodStartStr}
            AND receipt_date <= ${periodEndStr}
            AND status != 'voided'
        ) combined
      `);

      const totalsRows = Array.from(totalsResult as Iterable<Record<string, unknown>>);
      const chargesCents = Number(totalsRows[0]?.charges_cents ?? 0);
      const paymentsCents = Number(totalsRows[0]?.payments_cents ?? 0);

      // Get previous statement closing balance (or use 0 if first statement)
      const prevResult = await db.execute(sql`
        SELECT closing_balance_cents
        FROM billing_account_statements
        WHERE tenant_id = ${tenantId}
          AND billing_account_id = ${accountId}
          AND status != 'void'
        ORDER BY period_end DESC
        LIMIT 1
      `);
      const prevRows = Array.from(prevResult as Iterable<Record<string, unknown>>);
      const openingBalanceCents = Number(prevRows[0]?.closing_balance_cents ?? 0);
      const closingBalanceCents = openingBalanceCents + chargesCents - paymentsCents;

      // Due date
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + dueDays);
      const dueDateStr = dueDate.toISOString().split('T')[0]!;

      const stmtId = generateUlid();
      const stmtNumber = `STMT-${accountId.substring(0, 8)}-${periodStartStr.replace(/-/g, '')}`;

      await db.execute(sql`
        INSERT INTO billing_account_statements
          (id, tenant_id, billing_account_id, customer_id, statement_number,
           period_start, period_end, opening_balance_cents, charges_cents,
           payments_cents, closing_balance_cents, due_date, status)
        VALUES
          (${stmtId}, ${tenantId}, ${accountId}, ${customerId}, ${stmtNumber},
           ${periodStartStr}, ${periodEndStr}, ${openingBalanceCents}, ${chargesCents},
           ${paymentsCents}, ${closingBalanceCents}, ${dueDateStr}, 'finalized')
      `);

      generatedCount++;
      console.log(`${LOG_PREFIX} Generated statement ${stmtNumber} for account ${accountId} (closing: ${closingBalanceCents})`);
    } catch (err) {
      errorCount++;
      console.error(`${LOG_PREFIX} Failed to generate statement for account ${accountId}:`, err);
    }
  }

  console.log(`${LOG_PREFIX} Done — generated=${generatedCount} errors=${errorCount} elapsed=${Date.now() - startMs}ms`);

  return { generatedCount, errorCount, capped };
}
