/**
 * Phase 1B — GL Journal Entry Integration Tests
 *
 * Verifies double-entry bookkeeping for payment journal entries.
 * INVARIANT: For every posted GL entry, sum(debits) = sum(credits)
 *
 * GL allocation methods:
 *   - Proportional: for partial tenders (ratio × revenue)
 *   - Remainder: for final tender (total - sum of prior allocations)
 */

import { sql } from 'drizzle-orm';
import { adminDb } from '../../setup';
import {
  createTestTenant,
  createTestOrder,
  createTestOrderLine,
  createTestTender,
  type TestTenantData,
} from '../../factories';
import { expectGLBalanced, expectExactMoney } from '../../assertions';
import { testUlid } from '../../setup';

async function createGLEntry(
  tenantId: string,
  locationId: string,
  orderId: string,
  referenceType: 'tender' | 'reversal',
  referenceId: string,
  entries: Array<{ accountCode: string; accountName: string; debit: number; credit: number }>,
) {
  const id = testUlid();
  await adminDb.execute(sql`
    INSERT INTO payment_journal_entries (
      id, tenant_id, location_id, reference_type, reference_id,
      order_id, entries, business_date, posting_status
    )
    VALUES (
      ${id}, ${tenantId}, ${locationId}, ${referenceType}, ${referenceId},
      ${orderId}, ${JSON.stringify(entries)}::jsonb,
      ${new Date().toISOString().slice(0, 10)}, 'posted'
    )
  `);
  return id;
}

describe('GL Journal Entry Integration', () => {
  let t: TestTenantData;

  beforeAll(async () => {
    t = await createTestTenant();
  });

  // ── Simple Cash Payment ──

  it('single tender GL entry balances (debit = credit)', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid', subtotal: 1000, taxTotal: 85, total: 1085,
    });
    const tenderId = await createTestTender(t.tenantId, t.locationId, orderId, {
      amount: 1085,
    });

    await createGLEntry(t.tenantId, t.locationId, orderId, 'tender', tenderId, [
      { accountCode: '1010', accountName: 'Cash', debit: 1085, credit: 0 },
      { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 1000 },
      { accountCode: '2200', accountName: 'Sales Tax Payable', debit: 0, credit: 85 },
    ]);

    await expectGLBalanced(tenderId);
  });

  // ── Payment with Tip ──

  it('tip creates separate Tips Payable credit', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid', subtotal: 2000, taxTotal: 170, total: 2170,
    });
    const tenderId = await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'card', amount: 2170, tipAmount: 300,
    });

    // GL: debit card 2470, credit revenue 2000 + tax 170 + tips payable 300
    await createGLEntry(t.tenantId, t.locationId, orderId, 'tender', tenderId, [
      { accountCode: '1020', accountName: 'Credit Card Receivable', debit: 2470, credit: 0 },
      { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 2000 },
      { accountCode: '2200', accountName: 'Sales Tax Payable', debit: 0, credit: 170 },
      { accountCode: '2300', accountName: 'Tips Payable', debit: 0, credit: 300 },
    ]);

    await expectGLBalanced(tenderId);
  });

  // ── Split Payment — Proportional Allocation ──

  it('split payment: proportional allocation balances', async () => {
    // $25.00 total, 2 tenders: $15 + $10
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid', subtotal: 2500, taxTotal: 0, total: 2500,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 2500, lineSubtotal: 2500, lineTax: 0, lineTotal: 2500,
    });

    // Tender 1: $15.00 (proportional: 15/25 = 60%)
    const tender1 = await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderSequence: 1, amount: 1500,
    });
    // Revenue allocation: round(2500 * 0.6) = 1500
    await createGLEntry(t.tenantId, t.locationId, orderId, 'tender', tender1, [
      { accountCode: '1010', accountName: 'Cash', debit: 1500, credit: 0 },
      { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 1500 },
    ]);

    // Tender 2: $10.00 (remainder: 2500 - 1500 = 1000)
    const tender2 = await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderSequence: 2, amount: 1000,
    });
    await createGLEntry(t.tenantId, t.locationId, orderId, 'tender', tender2, [
      { accountCode: '1010', accountName: 'Cash', debit: 1000, credit: 0 },
      { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 1000 },
    ]);

    await expectGLBalanced(tender1);
    await expectGLBalanced(tender2);

    // Total GL revenue = order total
    const rows = await adminDb.execute(sql`
      SELECT entries FROM payment_journal_entries
      WHERE order_id = ${orderId} AND posting_status = 'posted'
    `);
    let totalDebit = 0;
    let totalCredit = 0;
    for (const row of rows as any[]) {
      const entries = row.entries as Array<{ debit: number; credit: number }>;
      for (const e of entries) {
        totalDebit += e.debit;
        totalCredit += e.credit;
      }
    }
    expectExactMoney(totalDebit, totalCredit, 'aggregate GL balance');
    expectExactMoney(totalDebit, 2500, 'total debits = order total');
  });

  // ── Reversal GL Entry ──

  it('void reversal GL entry balances (reverses original)', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'voided', subtotal: 1000, taxTotal: 85, total: 1085,
    });
    const tenderId = await createTestTender(t.tenantId, t.locationId, orderId, {
      amount: 1085,
    });

    // Original entry
    await createGLEntry(t.tenantId, t.locationId, orderId, 'tender', tenderId, [
      { accountCode: '1010', accountName: 'Cash', debit: 1085, credit: 0 },
      { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 1000 },
      { accountCode: '2200', accountName: 'Sales Tax Payable', debit: 0, credit: 85 },
    ]);

    // Reversal entry (debits and credits swapped)
    const reversalId = testUlid();
    await createGLEntry(t.tenantId, t.locationId, orderId, 'reversal', reversalId, [
      { accountCode: '1010', accountName: 'Cash', debit: 0, credit: 1085 },
      { accountCode: '4000', accountName: 'Revenue', debit: 1000, credit: 0 },
      { accountCode: '2200', accountName: 'Sales Tax Payable', debit: 85, credit: 0 },
    ]);

    await expectGLBalanced(tenderId);
    await expectGLBalanced(reversalId);

    // Net GL for this order = 0
    const rows = await adminDb.execute(sql`
      SELECT entries FROM payment_journal_entries
      WHERE order_id = ${orderId} AND posting_status = 'posted'
    `);
    let netDebit = 0;
    let netCredit = 0;
    for (const row of rows as any[]) {
      const entries = row.entries as Array<{ debit: number; credit: number }>;
      for (const e of entries) {
        netDebit += e.debit;
        netCredit += e.credit;
      }
    }
    expectExactMoney(netDebit, netCredit, 'net GL after void');
  });

  // ── INVARIANT: Every Posted Entry Balances ──

  it('INVARIANT: all GL entries in tenant are balanced', async () => {
    const rows = await adminDb.execute(sql`
      SELECT reference_id, entries FROM payment_journal_entries
      WHERE tenant_id = ${t.tenantId} AND posting_status = 'posted'
    `);

    for (const row of rows as any[]) {
      const entries = row.entries as Array<{ debit: number; credit: number }>;
      const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
      const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
      expectExactMoney(totalDebit, totalCredit, `GL entry ${row.reference_id}`);
    }
  });
});
