import { eq, and, sql, asc, sum } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customers,
  customerActivityLog,
  billingAccounts,
  arTransactions,
  arAllocations,
} from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';

// ── handleOrderPlaced ────────────────────────────────────────────
/**
 * Consumes `order.placed.v1`.
 *
 * 1. If the order has a customerId, increment visit/spend stats and log activity.
 * 2. If the order has a billingAccountId (house-account charge), create an AR
 *    charge, update the billing account balance, post a GL entry, and log activity.
 *
 * Idempotency: AR transaction insert is guarded by a duplicate check on
 * (referenceType, referenceId) so re-delivery is safe.
 */
export async function handleOrderPlaced(event: EventEnvelope): Promise<void> {
  const {
    orderId,
    orderNumber,
    total,
    locationId: eventLocationId,
    businessDate: eventBusinessDate,
    customerId: eventCustomerId,
    billingAccountId: eventBillingAccountId,
  } = event.data as {
    orderId: string;
    orderNumber: string;
    locationId: string;
    businessDate: string;
    total: number;
    subtotal: number;
    taxTotal: number;
    lineCount: number;
    customerId?: string | null;
    billingAccountId?: string | null;
  };

  const businessDate =
    eventBusinessDate || new Date().toISOString().slice(0, 10);
  const createdBy = event.actorUserId || 'system';

  // Capture GL-relevant data from inside withTenant for GL posting after
  let glPostingData: {
    arTxId: string;
    amountCents: number;
    locationId: string;
  } | null = null;

  await withTenant(event.tenantId, async (tx) => {
    const customerId = eventCustomerId ?? null;
    const billingAccountId = eventBillingAccountId ?? null;

    // ── Customer stats ──────────────────────────────────────────
    if (customerId) {
      await tx
        .update(customers)
        .set({
          totalVisits: sql`${customers.totalVisits} + 1`,
          totalSpend: sql`${customers.totalSpend} + ${total}`,
          lastVisitAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customers.tenantId, event.tenantId),
            eq(customers.id, customerId),
          ),
        );

      await tx.insert(customerActivityLog).values({
        id: generateUlid(),
        tenantId: event.tenantId,
        customerId,
        activityType: 'order_placed',
        title: `Order #${orderNumber} placed`,
        details: `Total: ${total}`,
        metadata: { orderId, total },
        createdBy,
      });
    }

    // ── House-account charge ────────────────────────────────────
    if (billingAccountId) {
      // Idempotency: skip if we already recorded a charge for this order
      const [existing] = await tx
        .select({ id: arTransactions.id })
        .from(arTransactions)
        .where(
          and(
            eq(arTransactions.tenantId, event.tenantId),
            eq(arTransactions.referenceType, 'order'),
            eq(arTransactions.referenceId, orderId),
          ),
        )
        .limit(1);

      if (!existing) {
        // Look up billing account for the customer (for activity log)
        const [billingAccount] = await tx
          .select()
          .from(billingAccounts)
          .where(
            and(
              eq(billingAccounts.tenantId, event.tenantId),
              eq(billingAccounts.id, billingAccountId),
            ),
          )
          .limit(1);

        // 1. AR charge
        const arTxId = generateUlid();
        await tx.insert(arTransactions).values({
          id: arTxId,
          tenantId: event.tenantId,
          billingAccountId,
          type: 'charge',
          amountCents: total,
          dueDate: businessDate,
          referenceType: 'order',
          referenceId: orderId,
          customerId: customerId ?? billingAccount?.primaryCustomerId ?? null,
          createdBy,
        });

        // 2. Update billing account balance
        await tx
          .update(billingAccounts)
          .set({
            currentBalanceCents: sql`${billingAccounts.currentBalanceCents} + ${total}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(billingAccounts.tenantId, event.tenantId),
              eq(billingAccounts.id, billingAccountId),
            ),
          );

        // Capture data for GL posting after transaction commits
        glPostingData = {
          arTxId,
          amountCents: total,
          locationId: event.locationId ?? eventLocationId ?? '',
        };

        // 3. Activity log for the billing charge
        const activityCustomerId =
          customerId ?? billingAccount?.primaryCustomerId;
        if (activityCustomerId) {
          await tx.insert(customerActivityLog).values({
            id: generateUlid(),
            tenantId: event.tenantId,
            customerId: activityCustomerId,
            activityType: 'billing_charge',
            title: `House account charged for Order #${orderNumber}`,
            details: `Charge: ${total}`,
            metadata: { orderId, billingAccountId, amountCents: total },
            createdBy,
          });
        }
      }
    }
  });

  // ── GL posting (after AR transaction committed) ──────────────
  if (glPostingData) {
    const { arTxId, amountCents, locationId } = glPostingData;
    try {
      const postingApi = getAccountingPostingApi();
      try { await postingApi.ensureSettings(event.tenantId); } catch { /* non-fatal */ }
      const settings = await postingApi.getSettings(event.tenantId);

      const arAccountId = settings.defaultARControlAccountId
        ?? settings.defaultUncategorizedRevenueAccountId;
      const revenueAccountId = settings.defaultUncategorizedRevenueAccountId;

      if (arAccountId && revenueAccountId) {
        const amountDollars = (amountCents / 100).toFixed(2);
        const result = await postingApi.postEntry(
          {
            tenantId: event.tenantId,
            user: { id: 'system', email: '' },
            requestId: `ar-charge-gl-${arTxId}`,
          } as any,
          {
            businessDate,
            sourceModule: 'billing',
            sourceReferenceId: `ar-charge-${arTxId}`,
            memo: `House account charge — Order #${orderNumber}`,
            lines: [
              { accountId: arAccountId, debitAmount: amountDollars, creditAmount: '0', locationId },
              { accountId: revenueAccountId, debitAmount: '0', creditAmount: amountDollars, locationId },
            ],
            forcePost: true,
          },
        );

        // Best-effort: link GL journal entry to AR transaction
        try {
          await withTenant(event.tenantId, async (tx) => {
            await tx
              .update(arTransactions)
              .set({ glJournalEntryId: result.id })
              .where(eq(arTransactions.id, arTxId));
          });
        } catch { /* non-fatal */ }
      } else {
        console.error(`[ar-gl] No AR or revenue GL account configured for tenant=${event.tenantId}, AR charge ${arTxId} has no GL entry`);
      }
    } catch (error) {
      // GL failures NEVER block AR operations
      console.error(`[ar-gl] GL posting failed for AR charge ${arTxId}:`, error);
    }
  }
}

// ── handleOrderVoided ────────────────────────────────────────────
/**
 * Consumes `order.voided.v1`.
 *
 * When an order with a house-account charge is voided, create a reversal
 * credit-memo AR transaction, adjust the billing account balance, post a
 * reversal GL entry, and log activity.
 *
 * Idempotency: guarded by duplicate check on referenceType='order_void'.
 */
export async function handleOrderVoided(event: EventEnvelope): Promise<void> {
  const {
    orderId,
    orderNumber,
    reason,
    locationId: eventLocationId,
    businessDate: eventBusinessDate,
  } = event.data as {
    orderId: string;
    orderNumber: string;
    reason: string;
    voidedBy: string;
    locationId?: string;
    businessDate?: string;
  };

  const createdBy = event.actorUserId || 'system';

  // Capture GL-relevant data from inside withTenant for GL posting after
  let glPostingData: {
    reversalTxId: string;
    absAmountCents: number;
    locationId: string;
    businessDate: string;
  } | null = null;

  await withTenant(event.tenantId, async (tx) => {
    // Find the original AR charge for this order
    const [originalCharge] = await tx
      .select()
      .from(arTransactions)
      .where(
        and(
          eq(arTransactions.tenantId, event.tenantId),
          eq(arTransactions.referenceType, 'order'),
          eq(arTransactions.referenceId, orderId),
          eq(arTransactions.type, 'charge'),
        ),
      )
      .limit(1);

    if (!originalCharge) return;

    // Idempotency: skip if we already recorded a reversal for this void
    const [existingReversal] = await tx
      .select({ id: arTransactions.id })
      .from(arTransactions)
      .where(
        and(
          eq(arTransactions.tenantId, event.tenantId),
          eq(arTransactions.referenceType, 'order_void'),
          eq(arTransactions.referenceId, orderId),
        ),
      )
      .limit(1);

    if (existingReversal) return;

    const reversalAmount = -originalCharge.amountCents;

    const businessDate =
      eventBusinessDate ?? new Date().toISOString().slice(0, 10);

    // 1. Reversal AR transaction
    const reversalTxId = generateUlid();
    await tx.insert(arTransactions).values({
      id: reversalTxId,
      tenantId: event.tenantId,
      billingAccountId: originalCharge.billingAccountId,
      type: 'credit_memo',
      amountCents: reversalAmount,
      referenceType: 'order_void',
      referenceId: orderId,
      customerId: originalCharge.customerId,
      notes: reason,
      createdBy,
    });

    // 2. Update billing account balance (subtract the original charge amount)
    await tx
      .update(billingAccounts)
      .set({
        currentBalanceCents: sql`${billingAccounts.currentBalanceCents} + ${reversalAmount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billingAccounts.tenantId, event.tenantId),
          eq(billingAccounts.id, originalCharge.billingAccountId),
        ),
      );

    // Capture data for GL posting after transaction commits
    glPostingData = {
      reversalTxId,
      absAmountCents: Math.abs(reversalAmount),
      locationId: event.locationId ?? eventLocationId ?? '',
      businessDate,
    };

    // 3. Activity log
    const activityCustomerId = originalCharge.customerId;
    if (!activityCustomerId) {
      // Fall back to billing account's primary customer
      const [billingAccount] = await tx
        .select({ primaryCustomerId: billingAccounts.primaryCustomerId })
        .from(billingAccounts)
        .where(
          and(
            eq(billingAccounts.tenantId, event.tenantId),
            eq(billingAccounts.id, originalCharge.billingAccountId),
          ),
        )
        .limit(1);

      if (billingAccount?.primaryCustomerId) {
        await tx.insert(customerActivityLog).values({
          id: generateUlid(),
          tenantId: event.tenantId,
          customerId: billingAccount.primaryCustomerId,
          activityType: 'billing_reversal',
          title: `House account charge reversed for voided Order #${orderNumber}`,
          details: reason,
          metadata: { orderId, billingAccountId: originalCharge.billingAccountId, reversalAmountCents: reversalAmount },
          createdBy,
        });
      }
    } else {
      await tx.insert(customerActivityLog).values({
        id: generateUlid(),
        tenantId: event.tenantId,
        customerId: activityCustomerId,
        activityType: 'billing_reversal',
        title: `House account charge reversed for voided Order #${orderNumber}`,
        details: reason,
        metadata: { orderId, billingAccountId: originalCharge.billingAccountId, reversalAmountCents: reversalAmount },
        createdBy,
      });
    }
  });

  // ── GL posting (after AR reversal committed) ──────────────
  if (glPostingData) {
    const { reversalTxId, absAmountCents, locationId, businessDate } = glPostingData;
    try {
      const postingApi = getAccountingPostingApi();
      try { await postingApi.ensureSettings(event.tenantId); } catch { /* non-fatal */ }
      const settings = await postingApi.getSettings(event.tenantId);

      const revenueAccountId = settings.defaultUncategorizedRevenueAccountId;
      const arAccountId = settings.defaultARControlAccountId
        ?? settings.defaultUncategorizedRevenueAccountId;

      if (revenueAccountId && arAccountId) {
        const amountDollars = (absAmountCents / 100).toFixed(2);
        const result = await postingApi.postEntry(
          {
            tenantId: event.tenantId,
            user: { id: 'system', email: '' },
            requestId: `ar-reversal-gl-${reversalTxId}`,
          } as any,
          {
            businessDate,
            sourceModule: 'billing',
            sourceReferenceId: `ar-reversal-${reversalTxId}`,
            memo: `House account charge reversed — Order #${orderNumber}`,
            lines: [
              { accountId: revenueAccountId, debitAmount: amountDollars, creditAmount: '0', locationId },
              { accountId: arAccountId, debitAmount: '0', creditAmount: amountDollars, locationId },
            ],
            forcePost: true,
          },
        );

        // Best-effort: link GL journal entry to AR transaction
        try {
          await withTenant(event.tenantId, async (tx) => {
            await tx
              .update(arTransactions)
              .set({ glJournalEntryId: result.id })
              .where(eq(arTransactions.id, reversalTxId));
          });
        } catch { /* non-fatal */ }
      } else {
        console.error(`[ar-gl] No revenue or AR GL account configured for tenant=${event.tenantId}, AR reversal ${reversalTxId} has no GL entry`);
      }
    } catch (error) {
      // GL failures NEVER block AR operations
      console.error(`[ar-gl] GL posting failed for AR reversal ${reversalTxId}:`, error);
    }
  }
}

// ── handleTenderRecorded ─────────────────────────────────────────
/**
 * Consumes `tender.recorded.v1`.
 *
 * Only processes tenders with tenderType === 'house_account'.
 *
 * Creates an AR payment transaction, auto-allocates payment to outstanding
 * charges using FIFO (ordered by dueDate), updates the billing account
 * balance, posts a GL entry, and logs activity.
 *
 * Idempotency: guarded by duplicate check on referenceType='tender',
 * referenceId=tenderId.
 */
export async function handleTenderRecorded(event: EventEnvelope): Promise<void> {
  const {
    tenderId,
    orderId,
    orderNumber,
    tenderType,
    amount,
    businessDate: eventBusinessDate,
    customerId: eventCustomerId,
    billingAccountId: eventBillingAccountId,
  } = event.data as {
    tenderId: string;
    orderId: string;
    orderNumber: string;
    locationId: string;
    businessDate: string;
    tenderType: string;
    tenderSequence: number;
    amount: number;
    tipAmount: number;
    changeGiven: number;
    amountGiven: number;
    employeeId: string;
    terminalId: string;
    shiftId: string | null;
    posMode: string | null;
    source: string;
    orderTotal: number;
    totalTendered: number;
    remainingBalance: number;
    isFullyPaid: boolean;
    customerId?: string | null;
    billingAccountId?: string | null;
  };

  // Only process house_account tenders
  if (tenderType !== 'house_account') return;

  const businessDate =
    eventBusinessDate || new Date().toISOString().slice(0, 10);
  const createdBy = event.actorUserId || 'system';

  // Capture GL-relevant data from inside withTenant for GL posting after
  let glPostingData: {
    paymentTxId: string;
    amountCents: number;
    locationId: string;
  } | null = null;

  await withTenant(event.tenantId, async (tx) => {
    const billingAccountId = eventBillingAccountId ?? null;
    if (!billingAccountId) return;

    // Idempotency: skip if we already recorded a payment for this tender
    const [existing] = await tx
      .select({ id: arTransactions.id })
      .from(arTransactions)
      .where(
        and(
          eq(arTransactions.tenantId, event.tenantId),
          eq(arTransactions.referenceType, 'tender'),
          eq(arTransactions.referenceId, tenderId),
        ),
      )
      .limit(1);

    if (existing) return;

    // Resolve customerId for the activity log
    const customerId = eventCustomerId ?? null;
    let activityCustomerId = customerId;
    if (!activityCustomerId) {
      const [billingAccount] = await tx
        .select({ primaryCustomerId: billingAccounts.primaryCustomerId })
        .from(billingAccounts)
        .where(
          and(
            eq(billingAccounts.tenantId, event.tenantId),
            eq(billingAccounts.id, billingAccountId),
          ),
        )
        .limit(1);
      activityCustomerId = billingAccount?.primaryCustomerId ?? null;
    }

    // 1. AR payment transaction (negative reduces balance)
    const paymentTxId = generateUlid();
    await tx.insert(arTransactions).values({
      id: paymentTxId,
      tenantId: event.tenantId,
      billingAccountId,
      type: 'payment',
      amountCents: -amount, // negative reduces balance
      referenceType: 'tender',
      referenceId: tenderId,
      customerId: activityCustomerId,
      createdBy,
    });

    // 2. FIFO allocation to outstanding charges
    // Find all charges for this billing account, ordered by dueDate (FIFO)
    const outstandingCharges = await tx
      .select()
      .from(arTransactions)
      .where(
        and(
          eq(arTransactions.tenantId, event.tenantId),
          eq(arTransactions.billingAccountId, billingAccountId),
          eq(arTransactions.type, 'charge'),
        ),
      )
      .orderBy(asc(arTransactions.dueDate), asc(arTransactions.createdAt));

    let remainingToAllocate = amount;

    for (const charge of outstandingCharges) {
      if (remainingToAllocate <= 0) break;

      // Sum existing allocations for this charge
      const [allocResult] = await tx
        .select({ allocated: sum(arAllocations.amountCents) })
        .from(arAllocations)
        .where(
          and(
            eq(arAllocations.tenantId, event.tenantId),
            eq(arAllocations.chargeTransactionId, charge.id),
          ),
        );

      const totalAllocated = Number(allocResult?.allocated ?? 0);
      const unallocated = charge.amountCents - totalAllocated;

      if (unallocated <= 0) continue;

      const allocateAmount = Math.min(remainingToAllocate, unallocated);

      await tx.insert(arAllocations).values({
        id: generateUlid(),
        tenantId: event.tenantId,
        paymentTransactionId: paymentTxId,
        chargeTransactionId: charge.id,
        amountCents: allocateAmount,
      });

      remainingToAllocate -= allocateAmount;
    }

    // 3. Update billing account balance
    await tx
      .update(billingAccounts)
      .set({
        currentBalanceCents: sql`${billingAccounts.currentBalanceCents} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billingAccounts.tenantId, event.tenantId),
          eq(billingAccounts.id, billingAccountId),
        ),
      );

    // Capture data for GL posting after transaction commits
    glPostingData = {
      paymentTxId,
      amountCents: amount,
      locationId: event.locationId ?? '',
    };

    // 4. Activity log
    if (activityCustomerId) {
      await tx.insert(customerActivityLog).values({
        id: generateUlid(),
        tenantId: event.tenantId,
        customerId: activityCustomerId,
        activityType: 'billing_payment',
        title: `Payment received for Order #${orderNumber}`,
        details: `Amount: ${amount}`,
        metadata: { orderId, billingAccountId, tenderId, amountCents: amount },
        createdBy,
      });
    }
  });

  // ── GL posting (after AR payment committed) ──────────────
  if (glPostingData) {
    const { paymentTxId, amountCents, locationId } = glPostingData;
    try {
      const postingApi = getAccountingPostingApi();
      try { await postingApi.ensureSettings(event.tenantId); } catch { /* non-fatal */ }
      const settings = await postingApi.getSettings(event.tenantId);

      const cashAccountId = settings.defaultUndepositedFundsAccountId
        ?? settings.defaultUncategorizedRevenueAccountId;
      const arAccountId = settings.defaultARControlAccountId
        ?? settings.defaultUncategorizedRevenueAccountId;

      if (cashAccountId && arAccountId) {
        const amountDollars = (amountCents / 100).toFixed(2);
        const result = await postingApi.postEntry(
          {
            tenantId: event.tenantId,
            user: { id: 'system', email: '' },
            requestId: `ar-payment-gl-${paymentTxId}`,
          } as any,
          {
            businessDate,
            sourceModule: 'billing',
            sourceReferenceId: `ar-payment-${paymentTxId}`,
            memo: `House account payment — Order #${orderNumber}`,
            lines: [
              { accountId: cashAccountId, debitAmount: amountDollars, creditAmount: '0', locationId },
              { accountId: arAccountId, debitAmount: '0', creditAmount: amountDollars, locationId },
            ],
            forcePost: true,
          },
        );

        // Best-effort: link GL journal entry to AR transaction
        try {
          await withTenant(event.tenantId, async (tx) => {
            await tx
              .update(arTransactions)
              .set({ glJournalEntryId: result.id })
              .where(eq(arTransactions.id, paymentTxId));
          });
        } catch { /* non-fatal */ }
      } else {
        console.error(`[ar-gl] No cash or AR GL account configured for tenant=${event.tenantId}, AR payment ${paymentTxId} has no GL entry`);
      }
    } catch (error) {
      // GL failures NEVER block AR operations
      console.error(`[ar-gl] GL posting failed for AR payment ${paymentTxId}:`, error);
    }
  }
}
