/**
 * Next.js Instrumentation — runs once when the server starts.
 *
 * - Registers cross-module API singletons
 * - Starts the event system (outbox worker)
 * - Registers all module event consumers with the in-memory event bus
 *
 * Performance: Critical-path modules (reporting, inventory, customers, payments,
 * accounting core) are loaded in parallel. Non-critical modules (golf, PMS, F&B
 * reporting) are deferred until after the first request to reduce cold start time.
 *
 * NOTE: Sentry is wired up. Set SENTRY_DSN env var to activate error tracking.
 * Configs in sentry.server.config.ts / sentry.edge.config.ts gate on SENTRY_DSN.
 */

import * as Sentry from '@sentry/nextjs';

/* eslint-disable @typescript-eslint/no-explicit-any */

async function importSafe(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`[instrumentation] ${label}`);
  } catch (e) {
    console.error(`[instrumentation] Failed: ${label}`, e);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');

    const { initializeEventSystem, getEventBus } = await import('@oppsera/core');
    await initializeEventSystem();
    const bus = getEventBus();

    // ── CRITICAL PATH: Singletons + core consumers in parallel ──────
    // These handle POS, orders, payments, and reporting — must be ready
    // before the first request.
    await Promise.all([
      // Singletons
      importSafe('CatalogReadApi', async () => {
        const { registerCatalogReadApi } = await import('@oppsera/module-catalog');
        registerCatalogReadApi();
      }),
      importSafe('OrdersWriteApi', async () => {
        const { initializeOrdersWriteApi } = await import('./lib/orders-bootstrap');
        await initializeOrdersWriteApi();
      }),
      importSafe('PaymentsGatewayApi', async () => {
        const { initializePaymentsGatewayApi } = await import('./lib/payments-bootstrap');
        await initializePaymentsGatewayApi();
      }),
      importSafe('ReconciliationReadApi', async () => {
        const { initializeReconciliationReadApi } = await import('./lib/reconciliation-bootstrap');
        await initializeReconciliationReadApi();
      }),
      importSafe('PmsReadApi + PmsWriteApi', async () => {
        const { initializePmsApis } = await import('./lib/pms-bootstrap');
        await initializePmsApis();
      }),
      importSafe('AccountingPostingApi + core GL consumers', async () => {
        const { initializeAccountingPostingApi } = await import('./lib/accounting-bootstrap');
        await initializeAccountingPostingApi();

        const accounting = await import('@oppsera/module-accounting');
        bus.subscribe('tender.recorded.v1', accounting.handleTenderForAccounting, 'accounting/tender.recorded');
        bus.subscribe('order.voided.v1', accounting.handleOrderVoidForAccounting, 'accounting/order.voided');
        bus.subscribe('order.returned.v1', accounting.handleOrderReturnForAccounting, 'accounting/order.returned');
      }),

      // Core event consumers (run on every order/tender/inventory event)
      importSafe('Reporting consumers', async () => {
        const reporting = await import('@oppsera/module-reporting');
        bus.subscribe('order.placed.v1', reporting.handleOrderPlaced, 'reporting/order.placed');
        bus.subscribe('order.voided.v1', reporting.handleOrderVoided, 'reporting/order.voided');
        bus.subscribe('order.returned.v1', reporting.handleOrderReturned, 'reporting/order.returned');
        bus.subscribe('tender.recorded.v1', reporting.handleTenderRecorded, 'reporting/tender.recorded');
        // Wire actual inventory events to populate rm_inventory_on_hand read model.
        // The commands emit inventory.received.v1 and inventory.adjusted.v1 — adapt their payloads
        // to the shape handleInventoryMovement expects.
        bus.subscribe('inventory.received.v1', (event) => {
          const d = event.data as { inventoryItemId: string; locationId: string; quantity: number };
          return reporting.handleInventoryMovement({
            ...event,
            data: {
              inventoryItemId: d.inventoryItemId,
              locationId: d.locationId,
              delta: d.quantity,
            },
          });
        }, 'reporting/inventory.received.on_hand');
        bus.subscribe('inventory.adjusted.v1', (event) => {
          const d = event.data as { inventoryItemId: string; locationId: string; quantityDelta: number };
          return reporting.handleInventoryMovement({
            ...event,
            data: {
              inventoryItemId: d.inventoryItemId,
              locationId: d.locationId,
              delta: d.quantityDelta,
            },
          });
        }, 'reporting/inventory.adjusted.on_hand');
        // Inventory transfers emit two on-hand deltas: negative at source, positive at destination
        bus.subscribe('inventory.transferred.v1', async (event) => {
          const d = event.data as {
            sourceInventoryItemId: string;
            destInventoryItemId: string;
            fromLocationId: string;
            toLocationId: string;
            quantity: number;
          };
          await reporting.handleInventoryMovement({
            ...event,
            data: {
              inventoryItemId: d.sourceInventoryItemId,
              locationId: d.fromLocationId,
              delta: -d.quantity,
            },
          });
          await reporting.handleInventoryMovement({
            ...event,
            eventId: `${event.eventId}:dest`,
            data: {
              inventoryItemId: d.destInventoryItemId,
              locationId: d.toLocationId,
              delta: d.quantity,
            },
          });
        }, 'reporting/inventory.transferred.on_hand');
        // Modifier analytics read models (rm_modifier_item_sales, rm_modifier_daypart, rm_modifier_group_attach)
        bus.subscribe('order.placed.v1', (event) =>
          reporting.handleOrderPlacedModifiers({
            eventId: event.eventId,
            tenantId: event.tenantId,
            occurredAt: event.occurredAt,
            locationId: event.locationId ?? '',
            lines: (event.data as Record<string, unknown>).lines as Array<{
              catalogItemId: string;
              catalogItemName: string;
              qty: number;
              modifiers: Array<{ modifierId: string; modifierGroupId: string | null; name: string; priceAdjustmentCents: number; instruction: 'none' | 'extra' | 'on_side' | null; isDefault: boolean }>;
              assignedModifierGroupIds: Array<{ modifierGroupId: string; groupName: string | null; isRequired: boolean }>;
            }>,
          }),
        'reporting/order.placed.modifiers');
        bus.subscribe('order.voided.v1', (event) =>
          reporting.handleOrderVoidedModifiers({
            eventId: event.eventId,
            tenantId: event.tenantId,
            occurredAt: event.occurredAt,
            locationId: event.locationId ?? '',
            lines: (event.data as Record<string, unknown>).lines as Array<{
              catalogItemId: string;
              catalogItemName: string;
              qty: number;
              modifiers: Array<{ modifierId: string; modifierGroupId: string | null; name: string; priceAdjustmentCents: number }>;
            }>,
          }),
        'reporting/order.voided.modifiers');
      }),
      importSafe('Inventory consumers', async () => {
        const inventory = await import('@oppsera/module-inventory');
        // Stable consumer names are required for idempotency — the processedEvents table
        // uses a unique index on (eventId, consumerName). Auto-generated names (based on
        // handler index) shift when registration order changes, breaking deduplication.
        bus.subscribe('order.placed.v1', inventory.handleOrderPlaced, 'inventory/order.placed');
        bus.subscribe('order.voided.v1', inventory.handleOrderVoided, 'inventory/order.voided');
        bus.subscribe('order.returned.v1', inventory.handleOrderReturned, 'inventory/order.returned');
        bus.subscribe('catalog.item.created.v1', inventory.handleCatalogItemCreated, 'inventory/catalog.item.created');
        bus.subscribe('catalog.item.archived.v1', inventory.handleCatalogItemArchived, 'inventory/catalog.item.archived');
        bus.subscribe('catalog.item.unarchived.v1', inventory.handleCatalogItemUnarchived, 'inventory/catalog.item.unarchived');
        bus.subscribe('inventory.low_stock.v1', inventory.handleInventoryLowStock, 'inventory/low_stock.notification');
        bus.subscribe('inventory.negative.v1', inventory.handleInventoryNegative, 'inventory/negative.notification');
      }),
      importSafe('Customer consumers', async () => {
        const customers = await import('@oppsera/module-customers');
        bus.subscribe('order.placed.v1', customers.handleOrderPlaced, 'customers/order.placed');
        bus.subscribe('order.voided.v1', customers.handleOrderVoided, 'customers/order.voided');
        bus.subscribe('order.returned.v1', customers.handleOrderReturned, 'customers/order.returned');
        bus.subscribe('tender.recorded.v1', customers.handleTenderRecorded, 'customers/tender.recorded');
      }),
      importSafe('Payment consumers', async () => {
        const payments = await import('@oppsera/module-payments');
        bus.subscribe('order.voided.v1', payments.handleOrderVoided, 'payments/order.voided');
      }),
      // KDS ticket creation: course sent/fired → create kitchen tickets.
      // Must be in the critical path — if deferred, cold-start events miss
      // the consumer and the outbox retry adds 10-30s KDS delay.
      importSafe('KDS ticket creation consumers', async () => {
        const fnb = await import('@oppsera/module-fnb');
        bus.subscribe('fnb.course.sent.v1', (event) => fnb.handleCourseSent(event.tenantId, event.data as any), 'kds/course.sent');
        bus.subscribe('fnb.course.fired.v1', (event) => fnb.handleCourseSent(event.tenantId, event.data as any), 'kds/course.fired');
        // Retail POS → KDS: create kitchen tickets for food/beverage items on order placed
        bus.subscribe('order.placed.v1', (event) => fnb.handleOrderPlacedForKds(event), 'kds/order.placed');
      }),
    ]);

    // ── DB connection warm-up REMOVED (2026-02-28) ──────────────────
    // Fire-and-forget DB queries on Vercel cause pool exhaustion:
    // when the event loop freezes after HTTP response, the warm-up
    // connection sits in ClientRead until statement_timeout (30s),
    // blocking the max:2 pool. The critical-path Promise.all above
    // already initializes the event system (which warms the pool).
    // See: Production Outage 2026-02-28 in MEMORY.md

    // ── DEFERRED PATH: Non-critical modules loaded after critical path ──
    // Golf, PMS, F&B reporting, and advanced accounting consumers are loaded
    // in the background. They handle module-specific events that don't affect
    // the core POS/order flow. If events arrive before these are registered,
    // the outbox will retry them (3x with exponential backoff).
    registerDeferredConsumers(bus).catch((e) =>
      console.error('[instrumentation] Deferred consumer registration failed:', e),
    );

    // ── Semantic registry pre-warm DISABLED (2026-02-28) ──────────
    // Fire-and-forget DB queries on Vercel cause pool exhaustion:
    // when the event loop freezes after HTTP response, connections sit
    // in ClientRead for up to statement_timeout (120s), blocking the
    // max:2 pool and preventing login. The SWR cache (5min TTL) in
    // registry.ts handles cold starts — first semantic query loads it.
    // See: Production Outage 2026-02-28 in MEMORY.md
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
async function registerDeferredConsumers(bus: ReturnType<Awaited<typeof import('@oppsera/core')>['getEventBus']>) {
  await Promise.allSettled([
    // CustomerWriteApi — only used by PMS guest creation
    importSafe('CustomerWriteApi', async () => {
      const { initializeCustomerWriteApi } = await import('./lib/customer-bootstrap');
      await initializeCustomerWriteApi();
    }),

    // Advanced accounting consumers (PMS, F&B, vouchers, chargebacks, ACH)
    importSafe('Accounting: module-specific GL consumers', async () => {
      const accounting = await import('@oppsera/module-accounting');
      bus.subscribe('pms.folio.charge_posted.v1', accounting.handleFolioChargeForAccounting, 'accounting/pms.folio.charge_posted');
      bus.subscribe('pms.loyalty.points_redeemed.v1', accounting.handleLoyaltyRedemptionForAccounting, 'accounting/pms.loyalty.points_redeemed');
      bus.subscribe('pms.payment.authorized.v1', accounting.handleDepositAuthorizedForAccounting, 'accounting/pms.payment.authorized');
      bus.subscribe('pms.payment.captured.v1', accounting.handleDepositCapturedForAccounting, 'accounting/pms.payment.captured');
      bus.subscribe('fnb.gl.posting_created.v1', accounting.handleFnbGlPostingForAccounting, 'accounting/fnb.gl.posting_created');
      bus.subscribe('fnb.gl.posting_reversed.v1', accounting.handleFnbGlPostingReversedForAccounting, 'accounting/fnb.gl.posting_reversed');
      bus.subscribe('voucher.purchased.v1', accounting.handleVoucherPurchaseForAccounting, 'accounting/voucher.purchased');
      bus.subscribe('voucher.redeemed.v1', accounting.handleVoucherRedemptionForAccounting, 'accounting/voucher.redeemed');
      bus.subscribe('voucher.expired.v1', accounting.handleVoucherExpirationForAccounting, 'accounting/voucher.expired');
      bus.subscribe('membership.billing.charged.v1', accounting.handleMembershipBillingForAccounting, 'accounting/membership.billing.charged');
      bus.subscribe('membership.initiation.contract.created.v1', accounting.handleInitiationContractForAccounting, 'accounting/membership.initiation.contract.created');
      bus.subscribe('membership.initiation.installment.billed.v1', accounting.handleInitiationInstallmentForAccounting, 'accounting/membership.initiation.installment.billed');
      bus.subscribe('membership.initiation.extra_principal.recorded.v1', accounting.handleInitiationExtraPrincipalForAccounting, 'accounting/membership.initiation.extra_principal.recorded');
      bus.subscribe('chargeback.received.v1', accounting.handleChargebackReceivedForAccounting, 'accounting/chargeback.received');
      bus.subscribe('chargeback.resolved.v1', accounting.handleChargebackResolvedForAccounting, 'accounting/chargeback.resolved');
      bus.subscribe('payment.gateway.ach_returned.v1', accounting.handleAchReturnForAccounting, 'accounting/ach_returned');
      bus.subscribe('payment.gateway.ach_originated.v1', accounting.handleAchOriginatedForAccounting, 'accounting/ach_originated');
      bus.subscribe('payment.gateway.ach_settled.v1', accounting.handleAchSettledForAccounting, 'accounting/ach_settled');
      bus.subscribe('payment.gateway.ach_returned.v1', accounting.handleAchReturnGlReversal, 'accounting/ach_return_gl_reversal');
      // Drawer session close → cash variance GL
      bus.subscribe('drawer.session.closed.v1', accounting.handleDrawerSessionClosedForAccounting, 'accounting/drawer.session.closed');
      // Stored value → deferred revenue GL (full lifecycle)
      bus.subscribe('customer.stored_value.issued.v1', accounting.handleStoredValueIssuedForAccounting, 'accounting/stored_value.issued');
      bus.subscribe('customer.stored_value.redeemed.v1', accounting.handleStoredValueRedeemedForAccounting, 'accounting/stored_value.redeemed');
      bus.subscribe('customer.stored_value.voided.v1', accounting.handleStoredValueVoidedForAccounting, 'accounting/stored_value.voided');
      bus.subscribe('customer.stored_value.reloaded.v1', accounting.handleStoredValueReloadedForAccounting, 'accounting/stored_value.reloaded');
      bus.subscribe('customer.stored_value.transferred.v1', accounting.handleStoredValueTransferredForAccounting, 'accounting/stored_value.transferred');
      // Tender reversal + tip adjustment → reverse GL
      bus.subscribe('tender.reversed.v1', accounting.handleTenderReversalForAccounting, 'accounting/tender.reversed');
      bus.subscribe('tender.tip_adjusted.v1', accounting.handleTipAdjustedForAccounting, 'accounting/tender.tip_adjusted');
      // Drawer events → paid_in/paid_out/cash_drop GL
      bus.subscribe('drawer.event.recorded.v1', accounting.handleDrawerEventForAccounting, 'accounting/drawer.event.recorded');
      // Customer financial operations → GL
      bus.subscribe('customer.ledger_entry.posted.v1', accounting.handleLedgerEntryForAccounting, 'accounting/customer.ledger_entry.posted');
      bus.subscribe('customer.account_transfer.completed.v1', accounting.handleAccountTransferForAccounting, 'accounting/customer.account_transfer.completed');
      bus.subscribe('customer_wallet.adjusted.v1', accounting.handleWalletAdjustedForAccounting, 'accounting/customer_wallet.adjusted');
      // Inventory receipts → GL
      bus.subscribe('inventory.receipt.posted.v1', accounting.handleInventoryReceiptPostedForAccounting, 'accounting/inventory.receipt.posted');
      bus.subscribe('inventory.receipt.voided.v1', accounting.handleInventoryReceiptVoidedForAccounting, 'accounting/inventory.receipt.voided');
      // Comp + line void → GL
      // TODO: These events are not yet published by the orders module — comp/void-line
      // commands need to be built. Until then, these consumers are dormant.
      bus.subscribe('order.line.comped.v1', accounting.handleCompForAccounting, 'accounting/order.line.comped');
      bus.subscribe('order.line.voided.v1', accounting.handleLineVoidForAccounting, 'accounting/order.line.voided');
      // Spa → GL
      bus.subscribe('spa.appointment.checked_out.v1', accounting.handleSpaCheckoutForAccounting, 'accounting/spa.appointment.checked_out');
      bus.subscribe('spa.package.sold.v1', accounting.handleSpaPackagePurchaseForAccounting, 'accounting/spa.package.sold');
      bus.subscribe('spa.package.redeemed.v1', accounting.handleSpaPackageRedemptionForAccounting, 'accounting/spa.package.redeemed');
      bus.subscribe('spa.commission.paid.v1', accounting.handleSpaCommissionPaidForAccounting, 'accounting/spa.commission.paid');
      // F&B tip pool distribution → GL (Dr Tip Liability / Cr Payroll Clearing or Cash)
      bus.subscribe('fnb.tip.pool_distributed.v1', accounting.handleFnbTipPoolDistributedForAccounting, 'accounting/fnb.tip.pool_distributed');
    }),

    // Unified revenue ledger consumers (PMS, AR, membership, voucher → rm_revenue_activity + rm_daily_sales)
    importSafe('Revenue ledger consumers', async () => {
      const reporting = await import('@oppsera/module-reporting');
      bus.subscribe('pms.folio.charge_posted.v1', reporting.handleFolioChargePosted, 'revenue/pms.folio.charge_posted');
      bus.subscribe('ar.invoice.posted.v1', reporting.handleArInvoicePosted, 'revenue/ar.invoice.posted');
      bus.subscribe('membership.billing.charged.v1', reporting.handleMembershipCharged, 'revenue/membership.billing.charged');
      bus.subscribe('voucher.purchased.v1', reporting.handleVoucherPurchased, 'revenue/voucher.purchased');
      bus.subscribe('ar.invoice.voided.v1', reporting.handleArInvoiceVoided, 'revenue/ar.invoice.voided');
      bus.subscribe('voucher.redeemed.v1', reporting.handleVoucherRedeemed, 'revenue/voucher.redeemed');
      bus.subscribe('voucher.expired.v1', reporting.handleVoucherExpired, 'revenue/voucher.expired');
      bus.subscribe('chargeback.received.v1', reporting.handleChargebackReceived, 'revenue/chargeback.received');
      bus.subscribe('chargeback.resolved.v1', reporting.handleChargebackResolved, 'revenue/chargeback.resolved');
      // F&B tender, guest pay, stored value → reporting read models
      bus.subscribe('fnb.payment.tender_applied.v1', reporting.handleFnbTenderApplied, 'revenue/fnb.payment.tender_applied');
      bus.subscribe('fnb.guestpay.payment_succeeded.v1', reporting.handleGuestPaySucceeded, 'revenue/fnb.guestpay.payment_succeeded');
      bus.subscribe('customer.stored_value.redeemed.v1', reporting.handleStoredValueRedeemed, 'revenue/stored_value.redeemed');
    }),

    // F&B Reporting consumers
    importSafe('F&B reporting consumers', async () => {
      const fnb = await import('@oppsera/module-fnb');
      bus.subscribe('fnb.tab.closed.v1', (event) => fnb.handleFnbTabClosed(event.tenantId, event.data as any), 'fnb_reporting/tab.closed');
      bus.subscribe('fnb.kds.ticket_bumped.v1', (event) => fnb.handleFnbTicketBumped(event.tenantId, event.data as any), 'fnb_reporting/kds.ticket_bumped');
      bus.subscribe('fnb.kds.item_bumped.v1', (event) => fnb.handleFnbItemBumped(event.tenantId, event.data as any), 'fnb_reporting/kds.item_bumped');
      bus.subscribe('fnb.ticket_item.status_changed.v1', (event) => fnb.handleFnbItemVoided(event.tenantId, event.data as any), 'fnb_reporting/ticket_item.status_changed');
      bus.subscribe('fnb.payment.check_comped.v1', (event) => fnb.handleFnbDiscountComp(event.tenantId, event.data as any), 'fnb_reporting/check_comped');
      bus.subscribe('fnb.payment.check_discounted.v1', (event) => fnb.handleFnbDiscountComp(event.tenantId, event.data as any), 'fnb_reporting/check_discounted');
      bus.subscribe('fnb.payment.check_voided.v1', (event) => fnb.handleFnbDiscountComp(event.tenantId, event.data as any), 'fnb_reporting/check_voided');
      // NOTE: fnb.course.sent.v1 / fnb.course.fired.v1 → KDS ticket creation
      // moved to critical path (above) to avoid cold-start delays.
    }),

    // Golf Reporting consumers
    importSafe('Golf reporting consumers', async () => {
      const golfReporting = await import('@oppsera/module-golf-reporting');
      bus.subscribe('tee_time.booked.v1', golfReporting.handleTeeTimeBooked, 'golf/tee_time.booked');
      bus.subscribe('tee_time.cancelled.v1', golfReporting.handleTeeTimeCancelled, 'golf/tee_time.cancelled');
      bus.subscribe('tee_time.no_show_marked.v1', golfReporting.handleTeeTimeNoShow, 'golf/tee_time.no_show');
      bus.subscribe('tee_time.checked_in.v1', golfReporting.handleTeeTimeCheckedIn, 'golf/tee_time.checked_in');
      bus.subscribe('tee_time.started.v1', golfReporting.handleTeeTimeStarted, 'golf/tee_time.started');
      bus.subscribe('tee_time.completed.v1', golfReporting.handleTeeTimeCompleted, 'golf/tee_time.completed');
      bus.subscribe('pace.checkpoint.v1', golfReporting.handlePaceCheckpoint, 'golf/pace.checkpoint');
      bus.subscribe('folio.posted.v1', golfReporting.handleFolioPosted, 'golf/folio.posted');
      bus.subscribe('channel.daily.booked.v1', golfReporting.handleChannelDailyBooked, 'golf/channel.daily.booked');
      bus.subscribe('channel.daily.cancelled.v1', golfReporting.handleChannelDailyCancelled, 'golf/channel.daily.cancelled');
    }),

    // PMS consumers (calendar + occupancy projectors + POS room charge/folio settlement)
    importSafe('PMS event consumers', async () => {
      const pms = await import('@oppsera/module-pms');
      bus.subscribe('pms.reservation.created.v1', pms.handleCalendarProjection, 'pms_calendar/reservation.created');
      bus.subscribe('pms.reservation.moved.v1', pms.handleCalendarProjection, 'pms_calendar/reservation.moved');
      bus.subscribe('pms.reservation.cancelled.v1', pms.handleCalendarProjection, 'pms_calendar/reservation.cancelled');
      bus.subscribe('pms.reservation.checked_in.v1', pms.handleCalendarProjection, 'pms_calendar/reservation.checked_in');
      bus.subscribe('pms.reservation.checked_out.v1', pms.handleCalendarProjection, 'pms_calendar/reservation.checked_out');
      bus.subscribe('pms.reservation.no_show.v1', pms.handleCalendarProjection, 'pms_calendar/reservation.no_show');

      bus.subscribe('pms.reservation.created.v1', pms.handleOccupancyProjection, 'pms_occupancy/reservation.created');
      bus.subscribe('pms.reservation.moved.v1', pms.handleOccupancyProjection, 'pms_occupancy/reservation.moved');
      bus.subscribe('pms.reservation.cancelled.v1', pms.handleOccupancyProjection, 'pms_occupancy/reservation.cancelled');
      bus.subscribe('pms.reservation.checked_in.v1', pms.handleOccupancyProjection, 'pms_occupancy/reservation.checked_in');
      bus.subscribe('pms.reservation.checked_out.v1', pms.handleOccupancyProjection, 'pms_occupancy/reservation.checked_out');
      bus.subscribe('pms.reservation.no_show.v1', pms.handleOccupancyProjection, 'pms_occupancy/reservation.no_show');

      // POS → PMS: room charge + folio settlement via tender events
      bus.subscribe('tender.recorded.v1', pms.handleRoomChargeTender, 'pms/tender.room_charge');
      bus.subscribe('tender.recorded.v1', pms.handleFolioSettlementTender, 'pms/tender.folio_settlement');
    }),

    // Spa CQRS reporting consumers (imported via subpath to avoid barrel pulling heavy deps)
    importSafe('Spa reporting consumers', async () => {
      const spaConsumers = await import('@oppsera/module-spa/consumers');
      bus.subscribe('spa.appointment.created.v1', spaConsumers.handleSpaAppointmentCreated, 'spa/appointment.created');
      bus.subscribe('spa.appointment.completed.v1', spaConsumers.handleSpaAppointmentCompleted, 'spa/appointment.completed');
      bus.subscribe('spa.appointment.canceled.v1', spaConsumers.handleSpaAppointmentCanceled, 'spa/appointment.canceled');
      bus.subscribe('spa.appointment.no_show.v1', spaConsumers.handleSpaAppointmentNoShow, 'spa/appointment.no_show');
      bus.subscribe('spa.appointment.checked_out.v1', spaConsumers.handleSpaAppointmentCheckedOut, 'spa/appointment.checked_out');
      bus.subscribe('spa.package.sold.v1', spaConsumers.handleSpaPackageSold, 'spa/package.sold');
      bus.subscribe('spa.package.redeemed.v1', spaConsumers.handleSpaPackageRedeemed, 'spa/package.redeemed');
    }),

    // PMS → Customer sync (cross-module guest-to-customer linking + Hotel Guest tag)
    importSafe('PMS→Customer sync consumer', async () => {
      const { handlePmsGuestCreated } = await import('./lib/pms-customer-sync');
      bus.subscribe('pms.guest.created.v1', handlePmsGuestCreated, 'pms_customer_sync/guest.created');
    }),

    // Project Costing — GL entry → project cost read model
    importSafe('Project Costing consumer', async () => {
      const projectCosting = await import('@oppsera/module-project-costing');
      bus.subscribe('accounting.journal.posted.v1', projectCosting.handleGlEntryPostedForProjectCost, 'project_costing/journal.posted');
    }),

    // Smart Tag event-driven evaluation consumers
    importSafe('Smart tag evaluation consumers', async () => {
      const customers = await import('@oppsera/module-customers');
      bus.subscribe('order.placed.v1', customers.handleTagEvaluationOnOrderPlaced, 'smart_tags/order.placed');
      bus.subscribe('tender.recorded.v1', customers.handleTagEvaluationOnTenderRecorded, 'smart_tags/tender.recorded');
      bus.subscribe('order.voided.v1', customers.handleTagEvaluationOnOrderVoided, 'smart_tags/order.voided');
      bus.subscribe('customer_visit.recorded.v1', customers.handleTagEvaluationOnVisitRecorded, 'smart_tags/customer_visit.recorded');
      bus.subscribe('membership.created.v1', customers.handleTagEvaluationOnMembershipChanged, 'smart_tags/membership.created');
    }),

    // Expense Management — read model projections
    importSafe('Expense consumers', async () => {
      const expenses = await import('@oppsera/module-expenses');
      bus.subscribe('expense.posted.v1', expenses.handleExpensePosted, 'expenses/expense.posted');
      bus.subscribe('expense.voided.v1', expenses.handleExpenseVoided, 'expenses/expense.voided');
      bus.subscribe('expense.reimbursed.v1', expenses.handleExpenseReimbursed, 'expenses/expense.reimbursed');
    }),

    // Register Tab auto-clear — clears tabs after payment/void
    importSafe('Register tab auto-clear consumers', async () => {
      const registerTabs = await import('@oppsera/core/register-tabs');
      bus.subscribe('tender.recorded.v1', registerTabs.handleTabAutoClearOnTender, 'register_tabs/tender.recorded');
      bus.subscribe('order.voided.v1', registerTabs.handleTabAutoClearOnVoid, 'register_tabs/order.voided');
    }),
  ]);
}

// Automatically captures unhandled server-side request errors
export const onRequestError = Sentry.captureRequestError;
