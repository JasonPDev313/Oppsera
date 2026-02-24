/**
 * Next.js Instrumentation — runs once when the server starts.
 *
 * - Registers cross-module API singletons
 * - Starts the event system (outbox worker)
 * - Registers all module event consumers with the in-memory event bus
 *
 * NOTE: Sentry integration is available but requires installing @sentry/nextjs.
 * Once installed, uncomment the sentry.server.config / sentry.edge.config imports below.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // TODO: Uncomment when @sentry/nextjs is installed:
    // await import('../sentry.server.config');
    const { initializeEventSystem, getEventBus } = await import('@oppsera/core');
    await initializeEventSystem();

    // ── Register cross-module read API singletons ────────────────
    try {
      const { registerCatalogReadApi } = await import('@oppsera/module-catalog');
      registerCatalogReadApi();
    } catch {
      // module-catalog may not be available in all builds
    }

    // ── Register orders write API (for PMS and other cross-module order creation) ──
    try {
      const { initializeOrdersWriteApi } = await import('./lib/orders-bootstrap');
      await initializeOrdersWriteApi();
      console.log('Initialized OrdersWriteApi singleton');
    } catch (e) {
      console.error('Failed to initialize OrdersWriteApi:', e);
    }

    // ── Register module event consumers ──────────────────────────
    const bus = getEventBus();

    // Reporting consumers
    try {
      const reporting = await import('@oppsera/module-reporting');
      bus.subscribe('order.placed.v1', reporting.handleOrderPlaced);
      bus.subscribe('order.voided.v1', reporting.handleOrderVoided);
      bus.subscribe('tender.recorded.v1', reporting.handleTenderRecorded);
      bus.subscribe('inventory.movement.created.v1', reporting.handleInventoryMovement);
      console.log('Registered reporting event consumers');
    } catch (e) {
      console.error('Failed to register reporting consumers:', e);
    }

    // Inventory consumers
    try {
      const inventory = await import('@oppsera/module-inventory');
      bus.subscribe('order.placed.v1', inventory.handleOrderPlaced);
      bus.subscribe('order.voided.v1', inventory.handleOrderVoided);
      bus.subscribe('order.returned.v1', inventory.handleOrderReturned);
      bus.subscribe('catalog.item.created.v1', inventory.handleCatalogItemCreated);
      console.log('Registered inventory event consumers');
    } catch (e) {
      console.error('Failed to register inventory consumers:', e);
    }

    // Customer consumers
    try {
      const customers = await import('@oppsera/module-customers');
      bus.subscribe('order.placed.v1', customers.handleOrderPlaced);
      bus.subscribe('order.voided.v1', customers.handleOrderVoided);
      bus.subscribe('tender.recorded.v1', customers.handleTenderRecorded);
      console.log('Registered customer event consumers');
    } catch (e) {
      console.error('Failed to register customer consumers:', e);
    }

    // ── Register payments gateway API (cross-module card processing) ──
    try {
      const { initializePaymentsGatewayApi } = await import('./lib/payments-bootstrap');
      await initializePaymentsGatewayApi();
      console.log('Initialized PaymentsGatewayApi singleton');
    } catch (e) {
      console.error('Failed to initialize PaymentsGatewayApi:', e);
    }

    // Payment consumers (tender reversal on void)
    try {
      const payments = await import('@oppsera/module-payments');
      bus.subscribe('order.voided.v1', payments.handleOrderVoided);
      console.log('Registered payment event consumers');
    } catch (e) {
      console.error('Failed to register payment consumers:', e);
    }

    // ── Register reconciliation read API (cross-module accounting queries) ──
    try {
      const { initializeReconciliationReadApi } = await import('./lib/reconciliation-bootstrap');
      await initializeReconciliationReadApi();
      console.log('Initialized ReconciliationReadApi singleton');
    } catch (e) {
      console.error('Failed to initialize ReconciliationReadApi:', e);
    }

    // Accounting bootstrap + POS GL adapter
    try {
      const { initializeAccountingPostingApi } = await import('./lib/accounting-bootstrap');
      await initializeAccountingPostingApi();
      console.log('Initialized AccountingPostingApi singleton');

      const accounting = await import('@oppsera/module-accounting');
      bus.subscribe('tender.recorded.v1', accounting.handleTenderForAccounting);
      bus.subscribe('order.voided.v1', accounting.handleOrderVoidForAccounting);
      bus.subscribe('order.returned.v1', accounting.handleOrderReturnForAccounting);
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
      console.log('Registered accounting event consumers');
    } catch (e) {
      console.error('Failed to initialize accounting:', e);
    }

    // F&B Reporting consumers
    // NOTE: F&B consumers use (tenantId, data) signature — wrap to match EventHandler(event)
    try {
      const fnb = await import('@oppsera/module-fnb');
      bus.subscribe('fnb.tab.closed.v1', (event) => fnb.handleFnbTabClosed(event.tenantId, event.data as unknown as Parameters<typeof fnb.handleFnbTabClosed>[1]));
      bus.subscribe('fnb.kds.ticket_bumped.v1', (event) => fnb.handleFnbTicketBumped(event.tenantId, event.data as unknown as Parameters<typeof fnb.handleFnbTicketBumped>[1]));
      bus.subscribe('fnb.kds.item_bumped.v1', (event) => fnb.handleFnbItemBumped(event.tenantId, event.data as unknown as Parameters<typeof fnb.handleFnbItemBumped>[1]));
      bus.subscribe('fnb.ticket_item.status_changed.v1', (event) => fnb.handleFnbItemVoided(event.tenantId, event.data as unknown as Parameters<typeof fnb.handleFnbItemVoided>[1]));
      bus.subscribe('fnb.payment.check_comped.v1', (event) => fnb.handleFnbDiscountComp(event.tenantId, event.data as unknown as Parameters<typeof fnb.handleFnbDiscountComp>[1]));
      bus.subscribe('fnb.payment.check_discounted.v1', (event) => fnb.handleFnbDiscountComp(event.tenantId, event.data as unknown as Parameters<typeof fnb.handleFnbDiscountComp>[1]));
      bus.subscribe('fnb.payment.check_voided.v1', (event) => fnb.handleFnbDiscountComp(event.tenantId, event.data as unknown as Parameters<typeof fnb.handleFnbDiscountComp>[1]));
      console.log('[events] F&B reporting consumers registered');
    } catch (e) {
      console.error('[events] Failed to register F&B reporting consumers:', e);
    }

    // Golf Reporting consumers
    try {
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
      console.log('Registered golf-reporting event consumers');
    } catch (e) {
      console.error('Failed to register golf-reporting consumers:', e);
    }

    // PMS consumers (calendar + occupancy projectors)
    try {
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
      console.log('Registered PMS event consumers');
    } catch (e) {
      console.error('Failed to register PMS consumers:', e);
    }

    // PMS → Customer sync (cross-module guest-to-customer linking + Hotel Guest tag)
    try {
      const { handlePmsGuestCreated } = await import('./lib/pms-customer-sync');
      bus.subscribe('pms.guest.created.v1', handlePmsGuestCreated);
      console.log('Registered PMS→Customer sync consumer');
    } catch (e) {
      console.error('Failed to register PMS→Customer sync consumer:', e);
    }
  }
  // TODO: Uncomment when @sentry/nextjs is installed:
  // if (process.env.NEXT_RUNTIME === 'edge') {
  //   await import('../sentry.edge.config');
  // }
}
