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
 * NOTE: Sentry integration is available but requires installing @sentry/nextjs.
 * Once installed, uncomment the sentry.server.config / sentry.edge.config imports below.
 */

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
    // TODO: Uncomment when @sentry/nextjs is installed:
    // await import('../sentry.server.config');

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
      importSafe('AccountingPostingApi + core GL consumers', async () => {
        const { initializeAccountingPostingApi } = await import('./lib/accounting-bootstrap');
        await initializeAccountingPostingApi();

        const accounting = await import('@oppsera/module-accounting');
        bus.subscribe('tender.recorded.v1', accounting.handleTenderForAccounting);
        bus.subscribe('order.voided.v1', accounting.handleOrderVoidForAccounting);
        bus.subscribe('order.returned.v1', accounting.handleOrderReturnForAccounting);
      }),

      // Core event consumers (run on every order/tender/inventory event)
      importSafe('Reporting consumers', async () => {
        const reporting = await import('@oppsera/module-reporting');
        bus.subscribe('order.placed.v1', reporting.handleOrderPlaced);
        bus.subscribe('order.voided.v1', reporting.handleOrderVoided);
        bus.subscribe('tender.recorded.v1', reporting.handleTenderRecorded);
        bus.subscribe('inventory.movement.created.v1', reporting.handleInventoryMovement);
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
        );
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
        );
      }),
      importSafe('Inventory consumers', async () => {
        const inventory = await import('@oppsera/module-inventory');
        bus.subscribe('order.placed.v1', inventory.handleOrderPlaced);
        bus.subscribe('order.voided.v1', inventory.handleOrderVoided);
        bus.subscribe('order.returned.v1', inventory.handleOrderReturned);
        bus.subscribe('catalog.item.created.v1', inventory.handleCatalogItemCreated);
      }),
      importSafe('Customer consumers', async () => {
        const customers = await import('@oppsera/module-customers');
        bus.subscribe('order.placed.v1', customers.handleOrderPlaced);
        bus.subscribe('order.voided.v1', customers.handleOrderVoided);
        bus.subscribe('tender.recorded.v1', customers.handleTenderRecorded);
      }),
      importSafe('Payment consumers', async () => {
        const payments = await import('@oppsera/module-payments');
        bus.subscribe('order.voided.v1', payments.handleOrderVoided);
      }),
    ]);

    // ── DEFERRED PATH: Non-critical modules loaded after critical path ──
    // Golf, PMS, F&B reporting, and advanced accounting consumers are loaded
    // in the background. They handle module-specific events that don't affect
    // the core POS/order flow. If events arrive before these are registered,
    // the outbox will retry them (3x with exponential backoff).
    registerDeferredConsumers(bus).catch((e) =>
      console.error('[instrumentation] Deferred consumer registration failed:', e),
    );
  }
  // TODO: Uncomment when @sentry/nextjs is installed:
  // if (process.env.NEXT_RUNTIME === 'edge') {
  //   await import('../sentry.edge.config');
  // }
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
      bus.subscribe('pms.folio.charge_posted.v1', accounting.handleFolioChargeForAccounting);
      bus.subscribe('pms.loyalty.points_redeemed.v1', accounting.handleLoyaltyRedemptionForAccounting);
      bus.subscribe('pms.payment.authorized.v1', accounting.handleDepositAuthorizedForAccounting);
      bus.subscribe('pms.payment.captured.v1', accounting.handleDepositCapturedForAccounting);
      bus.subscribe('fnb.gl.posting_created.v1', accounting.handleFnbGlPostingForAccounting);
      bus.subscribe('voucher.purchased.v1', accounting.handleVoucherPurchaseForAccounting);
      bus.subscribe('voucher.redeemed.v1', accounting.handleVoucherRedemptionForAccounting);
      bus.subscribe('voucher.expired.v1', accounting.handleVoucherExpirationForAccounting);
      bus.subscribe('membership.billing.charged.v1', accounting.handleMembershipBillingForAccounting);
      bus.subscribe('chargeback.received.v1', accounting.handleChargebackReceivedForAccounting);
      bus.subscribe('chargeback.resolved.v1', accounting.handleChargebackResolvedForAccounting);
      bus.subscribe('payment.gateway.ach_returned.v1', accounting.handleAchReturnForAccounting);
      bus.subscribe('payment.gateway.ach_originated.v1', accounting.handleAchOriginatedForAccounting);
      bus.subscribe('payment.gateway.ach_settled.v1', accounting.handleAchSettledForAccounting);
      bus.subscribe('payment.gateway.ach_returned.v1', accounting.handleAchReturnGlReversal);
    }),

    // F&B Reporting consumers
    importSafe('F&B reporting consumers', async () => {
      const fnb = await import('@oppsera/module-fnb');
      bus.subscribe('fnb.tab.closed.v1', (event) => fnb.handleFnbTabClosed(event.tenantId, event.data as any));
      bus.subscribe('fnb.kds.ticket_bumped.v1', (event) => fnb.handleFnbTicketBumped(event.tenantId, event.data as any));
      bus.subscribe('fnb.kds.item_bumped.v1', (event) => fnb.handleFnbItemBumped(event.tenantId, event.data as any));
      bus.subscribe('fnb.ticket_item.status_changed.v1', (event) => fnb.handleFnbItemVoided(event.tenantId, event.data as any));
      bus.subscribe('fnb.payment.check_comped.v1', (event) => fnb.handleFnbDiscountComp(event.tenantId, event.data as any));
      bus.subscribe('fnb.payment.check_discounted.v1', (event) => fnb.handleFnbDiscountComp(event.tenantId, event.data as any));
      bus.subscribe('fnb.payment.check_voided.v1', (event) => fnb.handleFnbDiscountComp(event.tenantId, event.data as any));
    }),

    // Golf Reporting consumers
    importSafe('Golf reporting consumers', async () => {
      const golfReporting = await import('@oppsera/module-golf-reporting');
      bus.subscribe('tee_time.booked.v1', golfReporting.handleTeeTimeBooked);
      bus.subscribe('tee_time.cancelled.v1', golfReporting.handleTeeTimeCancelled);
      bus.subscribe('tee_time.no_show_marked.v1', golfReporting.handleTeeTimeNoShow);
      bus.subscribe('tee_time.checked_in.v1', golfReporting.handleTeeTimeCheckedIn);
      bus.subscribe('tee_time.started.v1', golfReporting.handleTeeTimeStarted);
      bus.subscribe('tee_time.completed.v1', golfReporting.handleTeeTimeCompleted);
      bus.subscribe('pace.checkpoint.v1', golfReporting.handlePaceCheckpoint);
      bus.subscribe('folio.posted.v1', golfReporting.handleFolioPosted);
      bus.subscribe('channel.daily.booked.v1', golfReporting.handleChannelDailyBooked);
      bus.subscribe('channel.daily.cancelled.v1', golfReporting.handleChannelDailyCancelled);
    }),

    // PMS consumers (calendar + occupancy projectors)
    importSafe('PMS event consumers', async () => {
      const pms = await import('@oppsera/module-pms');
      bus.subscribe('pms.reservation.created.v1', pms.handleCalendarProjection);
      bus.subscribe('pms.reservation.moved.v1', pms.handleCalendarProjection);
      bus.subscribe('pms.reservation.cancelled.v1', pms.handleCalendarProjection);
      bus.subscribe('pms.reservation.checked_in.v1', pms.handleCalendarProjection);
      bus.subscribe('pms.reservation.checked_out.v1', pms.handleCalendarProjection);
      bus.subscribe('pms.reservation.no_show.v1', pms.handleCalendarProjection);

      bus.subscribe('pms.reservation.created.v1', pms.handleOccupancyProjection);
      bus.subscribe('pms.reservation.moved.v1', pms.handleOccupancyProjection);
      bus.subscribe('pms.reservation.cancelled.v1', pms.handleOccupancyProjection);
      bus.subscribe('pms.reservation.checked_in.v1', pms.handleOccupancyProjection);
      bus.subscribe('pms.reservation.checked_out.v1', pms.handleOccupancyProjection);
      bus.subscribe('pms.reservation.no_show.v1', pms.handleOccupancyProjection);
    }),

    // PMS → Customer sync (cross-module guest-to-customer linking + Hotel Guest tag)
    importSafe('PMS→Customer sync consumer', async () => {
      const { handlePmsGuestCreated } = await import('./lib/pms-customer-sync');
      bus.subscribe('pms.guest.created.v1', handlePmsGuestCreated);
    }),
  ]);
}
