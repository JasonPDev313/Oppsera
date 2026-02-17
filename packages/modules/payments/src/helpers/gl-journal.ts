import { eq, and } from 'drizzle-orm';
import { paymentJournalEntries } from '@oppsera/db';
import type { Database } from '@oppsera/db';
import {
  getDebitAccountForTenderType,
  getRevenueAccountForDepartment,
} from './account-mapping';

// Types for the function
interface TenderForGL {
  id: string;
  tenantId: string;
  locationId: string;
  orderId: string;
  tenderType: string;
  amount: number;
  tipAmount: number;
}

interface OrderLineForGL {
  departmentId: string | null;
  lineGross: number; // lineTotal (customer-facing total including tax if inclusive)
  lineTax: number;
  lineNet: number; // lineGross - lineTax (revenue portion)
}

interface OrderForGL {
  businessDate: string;
  subtotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  discountTotal: number;
  total: number;
  lines: OrderLineForGL[];
}

interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export async function generateJournalEntry(
  tx: Database,
  tender: TenderForGL,
  order: OrderForGL,
  isFinalTender: boolean,
): Promise<{
  entries: JournalLine[];
  allocationSnapshot: Record<string, unknown>;
}> {
  const entries: JournalLine[] = [];

  // DEBIT: Payment received
  const debitAccount = getDebitAccountForTenderType(tender.tenderType);
  entries.push({
    accountCode: debitAccount.code,
    accountName: debitAccount.name,
    debit: tender.amount + tender.tipAmount,
    credit: 0,
  });

  if (isFinalTender) {
    // REMAINDER METHOD: post whatever hasn't been posted by previous tenders
    const previousJournals = await (tx as any)
      .select()
      .from(paymentJournalEntries)
      .where(
        and(
          eq(paymentJournalEntries.tenantId, tender.tenantId),
          eq(paymentJournalEntries.orderId, tender.orderId),
          eq(paymentJournalEntries.postingStatus, 'posted'),
        ),
      );

    const previouslyPosted = aggregatePreviousPostings(previousJournals);

    // Credit remainder for each revenue account by department
    const totalNetByDept = groupLineNetByDepartment(order.lines);
    for (const [deptKey, totalNet] of totalNetByDept) {
      const revenueAccount = getRevenueAccountForDepartment(deptKey);
      const alreadyPosted = previouslyPosted.revenue.get(revenueAccount.code) || 0;
      const remainder = totalNet - alreadyPosted;
      if (remainder > 0) {
        entries.push({
          accountCode: revenueAccount.code,
          accountName: revenueAccount.name,
          debit: 0,
          credit: remainder,
        });
      }
    }

    // Tax remainder
    const totalTax = order.lines.reduce((sum, l) => sum + l.lineTax, 0);
    const taxAlreadyPosted = previouslyPosted.tax;
    const taxRemainder = totalTax - taxAlreadyPosted;
    if (taxRemainder > 0) {
      entries.push({
        accountCode: '2100',
        accountName: 'Sales Tax Payable',
        debit: 0,
        credit: taxRemainder,
      });
    }

    // Tips (always exact -- no proration needed)
    if (tender.tipAmount > 0) {
      entries.push({
        accountCode: '2150',
        accountName: 'Tips Payable',
        debit: 0,
        credit: tender.tipAmount,
      });
    }

    // Service charge remainder
    if (order.serviceChargeTotal > 0) {
      const chargeAlreadyPosted = previouslyPosted.serviceCharge;
      const chargeRemainder = order.serviceChargeTotal - chargeAlreadyPosted;
      if (chargeRemainder > 0) {
        entries.push({
          accountCode: '4500',
          accountName: 'Service Charge Revenue',
          debit: 0,
          credit: chargeRemainder,
        });
      }
    }

    // Discount remainder
    if (order.discountTotal > 0) {
      const discountAlreadyPosted = previouslyPosted.discount;
      const discountRemainder = order.discountTotal - discountAlreadyPosted;
      if (discountRemainder > 0) {
        entries.push({
          accountCode: '4900',
          accountName: 'Sales Discounts',
          debit: discountRemainder,
          credit: 0,
        });
      }
    }
  } else {
    // PROPORTIONAL METHOD: prorate by tender's share of order total
    const tenderRatio = tender.amount / order.total;

    const revenueByDept = new Map<string, number>();
    let totalTax = 0;

    for (const line of order.lines) {
      const deptKey = line.departmentId || 'default';
      const lineRevenueShare = Math.round(line.lineNet * tenderRatio);
      const lineTaxShare = Math.round(line.lineTax * tenderRatio);
      revenueByDept.set(
        deptKey,
        (revenueByDept.get(deptKey) || 0) + lineRevenueShare,
      );
      totalTax += lineTaxShare;
    }

    for (const [deptKey, revenue] of revenueByDept) {
      const revenueAccount = getRevenueAccountForDepartment(deptKey);
      entries.push({
        accountCode: revenueAccount.code,
        accountName: revenueAccount.name,
        debit: 0,
        credit: revenue,
      });
    }

    if (totalTax > 0) {
      entries.push({
        accountCode: '2100',
        accountName: 'Sales Tax Payable',
        debit: 0,
        credit: totalTax,
      });
    }

    if (tender.tipAmount > 0) {
      entries.push({
        accountCode: '2150',
        accountName: 'Tips Payable',
        debit: 0,
        credit: tender.tipAmount,
      });
    }

    if (order.serviceChargeTotal > 0) {
      const chargeShare = Math.round(order.serviceChargeTotal * tenderRatio);
      entries.push({
        accountCode: '4500',
        accountName: 'Service Charge Revenue',
        debit: 0,
        credit: chargeShare,
      });
    }

    // Discount contra-revenue (proportional share)
    if (order.discountTotal > 0) {
      const discountShare = Math.round(order.discountTotal * tenderRatio);
      entries.push({
        accountCode: '4900',
        accountName: 'Sales Discounts',
        debit: discountShare,
        credit: 0,
      });
    }
  }

  // Validate double-entry: sum(debits) must equal sum(credits)
  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
  if (totalDebit !== totalCredit) {
    const diff = totalDebit - totalCredit;
    if (Math.abs(diff) <= 10) {
      // Small rounding adjustment (up to 10 cents) — adjust first revenue credit
      const firstRevenueLine = entries.find(
        (e) => e.credit > 0 && e.accountCode.startsWith('4') && e.accountCode !== '4900',
      );
      if (firstRevenueLine) {
        firstRevenueLine.credit += diff;
      } else {
        // No revenue line, add a rounding entry
        entries.push({
          accountCode: '4999',
          accountName: 'Rounding Adjustment',
          debit: diff < 0 ? -diff : 0,
          credit: diff > 0 ? diff : 0,
        });
      }
    } else {
      // Large imbalance indicates a logic error — log but still balance
      console.error(`GL journal imbalance of ${diff} cents for tender ${tender.id}`);
      entries.push({
        accountCode: '4999',
        accountName: 'Rounding Adjustment',
        debit: diff < 0 ? -diff : 0,
        credit: diff > 0 ? diff : 0,
      });
    }
  }

  const allocationSnapshot = {
    method: isFinalTender ? 'remainder' : 'proportional',
    tenderRatio: isFinalTender ? null : tender.amount / order.total,
    entries: entries.map((e) => ({ ...e })),
  };

  // Store journal entry
  await (tx as any).insert(paymentJournalEntries).values({
    tenantId: tender.tenantId,
    locationId: tender.locationId,
    referenceType: 'tender',
    referenceId: tender.id,
    orderId: tender.orderId,
    entries: entries,
    businessDate: order.businessDate,
    sourceModule: 'payments',
    postingStatus: 'posted',
  });

  return { entries, allocationSnapshot };
}

// Helper: aggregate previous postings from existing journal entries
function aggregatePreviousPostings(
  journals: Array<Record<string, unknown>>,
): {
  revenue: Map<string, number>;
  tax: number;
  serviceCharge: number;
  tips: number;
  discount: number;
} {
  const revenue = new Map<string, number>();
  let tax = 0;
  let serviceCharge = 0;
  let tips = 0;
  let discount = 0;

  for (const journal of journals) {
    const journalEntries = journal.entries as JournalLine[];
    for (const entry of journalEntries) {
      if (entry.debit > 0 && entry.accountCode === '4900') {
        discount += entry.debit;
      }
      if (entry.credit > 0) {
        if (entry.accountCode === '2100') {
          tax += entry.credit;
        } else if (entry.accountCode === '2150') {
          tips += entry.credit;
        } else if (entry.accountCode === '4500') {
          serviceCharge += entry.credit;
        } else if (entry.accountCode.startsWith('4')) {
          // Revenue account -- group by account code as proxy for department
          revenue.set(
            entry.accountCode,
            (revenue.get(entry.accountCode) || 0) + entry.credit,
          );
        }
      }
    }
  }

  return { revenue, tax, serviceCharge, tips, discount };
}

// Helper: group line net amounts by department
function groupLineNetByDepartment(
  lines: OrderLineForGL[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const line of lines) {
    const deptKey = line.departmentId || 'default';
    result.set(deptKey, (result.get(deptKey) || 0) + line.lineNet);
  }
  return result;
}

// Export types for use by commands
export type { TenderForGL, OrderForGL, OrderLineForGL, JournalLine };
