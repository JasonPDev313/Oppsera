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

    // Payment consumers (tender reversal on void)
    try {
      const payments = await import('@oppsera/module-payments');
      bus.subscribe('order.voided.v1', payments.handleOrderVoided);
      console.log('Registered payment event consumers');
    } catch (e) {
      console.error('Failed to register payment consumers:', e);
    }

    // Accounting bootstrap + POS GL adapter
    try {
      const { initializeAccountingPostingApi } = await import('./lib/accounting-bootstrap');
      await initializeAccountingPostingApi();
      console.log('Initialized AccountingPostingApi singleton');

      const accounting = await import('@oppsera/module-accounting');
      bus.subscribe('tender.recorded.v1', accounting.handleTenderForAccounting);
      bus.subscribe('pms.folio.charge_posted.v1', accounting.handleFolioChargeForAccounting);
      console.log('Registered accounting event consumers');
    } catch (e) {
      console.error('Failed to initialize accounting:', e);
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
  }
  // TODO: Uncomment when @sentry/nextjs is installed:
  // if (process.env.NEXT_RUNTIME === 'edge') {
  //   await import('../sentry.edge.config');
  // }
}
