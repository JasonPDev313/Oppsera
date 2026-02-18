/**
 * Next.js Instrumentation — runs once when the server starts.
 *
 * - Registers cross-module API singletons
 * - Starts the event system (outbox worker)
 *
 * NOTE: Sentry integration is available but requires installing @sentry/nextjs.
 * Once installed, uncomment the sentry.server.config / sentry.edge.config imports below.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // TODO: Uncomment when @sentry/nextjs is installed:
    // await import('../sentry.server.config');
    const { initializeEventSystem } = await import('@oppsera/core');
    await initializeEventSystem();
    try {
      const { registerCatalogReadApi } = await import('@oppsera/module-catalog');
      registerCatalogReadApi();
    } catch {
      // module-catalog may not be available in all builds
    }
  }
  // TODO: Uncomment when @sentry/nextjs is installed:
  // if (process.env.NEXT_RUNTIME === 'edge') {
  //   await import('../sentry.edge.config');
  // }
}
