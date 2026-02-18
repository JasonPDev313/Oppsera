/**
 * Background worker entry point — runs as a standalone container.
 *
 * Responsibilities:
 * - Polls event_outbox for unpublished events
 * - Dispatches to in-process event bus (same handlers as in-app)
 * - Runs scheduled health checks
 *
 * Usage: node --import tsx infra/worker.ts
 * Docker: CMD ["node", "--import", "tsx", "infra/worker.ts"]
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load env
config({ path: resolve(__dirname, '../.env.local') });
config({ path: resolve(__dirname, '../.env') });

import {
  initializeEventSystem,
  shutdownEventSystem,
  getOutboxWorker,
} from '@oppsera/core';
import { logger } from '@oppsera/core/observability';

const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function main() {
  logger.info('Worker starting', { pid: process.pid });

  // Initialize event system (creates bus + outbox worker)
  await initializeEventSystem();

  // Register all module event consumers
  try {
    const { registerInventoryEvents } = await import('@oppsera/module-inventory');
    const { registerPaymentEvents } = await import('@oppsera/module-payments');
    registerInventoryEvents();
    registerPaymentEvents();
    logger.info('Module event consumers registered');
  } catch (err) {
    logger.error('Failed to register event consumers', {
      error: { message: err instanceof Error ? err.message : String(err) },
    });
  }

  // Periodic health logging
  const healthInterval = setInterval(async () => {
    const worker = getOutboxWorker();
    logger.info('Worker health', {
      running: worker?.isRunning() ?? false,
      uptime: Math.round(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
  }, HEALTH_CHECK_INTERVAL);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Worker shutting down (${signal})`);
    clearInterval(healthInterval);
    await shutdownEventSystem();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('Worker ready — polling outbox');
}

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
