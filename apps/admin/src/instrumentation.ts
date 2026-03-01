/**
 * Admin app instrumentation — runs once on server startup.
 * Starts the backup scheduler polling loop.
 */

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export async function register() {
  // Only run on the Node.js runtime (not edge or during build)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Avoid double-start in dev (HMR)
  if (schedulerInterval) return;

  // Poll every 60 seconds — the scheduler itself checks if a backup is actually due
  const POLL_INTERVAL_MS = 60_000;

  // Delay first run by 10 seconds to let the server finish starting
  const startupTimer = setTimeout(() => {
    void runSchedulerCheck();

    schedulerInterval = setInterval(() => {
      void runSchedulerCheck();
    }, POLL_INTERVAL_MS);
    // Don't block Vercel function shutdown
    if (schedulerInterval && typeof schedulerInterval === 'object' && 'unref' in schedulerInterval) {
      schedulerInterval.unref();
    }
  }, 10_000);
  // Don't block Vercel function shutdown
  if (typeof startupTimer === 'object' && 'unref' in startupTimer) {
    startupTimer.unref();
  }

  console.log('[admin] Backup scheduler polling started (every 60s)');
}

async function runSchedulerCheck() {
  try {
    const { maybeRunScheduledBackup } = await import(/* webpackIgnore: true */ '@/lib/backup/scheduler');
    const didRun = await maybeRunScheduledBackup();
    if (didRun) {
      console.log('[admin] Scheduled backup completed');
    }
  } catch (err) {
    console.error('[admin] Scheduled backup check failed:', err);
  }
}
