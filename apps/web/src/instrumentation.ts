/**
 * Next.js Instrumentation — runs once when the server starts.
 * Registers cross-module API singletons so they're available before any API route executes.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerCatalogReadApi } = await import('@oppsera/module-catalog');
    registerCatalogReadApi();
  }
}
