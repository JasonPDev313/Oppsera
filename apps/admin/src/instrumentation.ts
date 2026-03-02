/**
 * Admin app instrumentation — runs once on server startup.
 *
 * IMPORTANT: No setInterval, no fire-and-forget DB queries.
 * Backup scheduling is driven ENTIRELY by Vercel Cron hitting
 * /api/v1/admin/backups/cron — not by in-process timers.
 *
 * See CLAUDE.md gotchas #466-#473 for why setInterval is lethal on Vercel.
 */

export async function register() {
  // Only run on the Node.js runtime (not edge or during build)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  console.log('[admin] Server started. Backup scheduling is cron-driven (no in-process timers).');
}
