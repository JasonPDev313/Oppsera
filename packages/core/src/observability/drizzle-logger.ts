/**
 * Drizzle ORM logger hook — counts queries and measures duration per request.
 *
 * Integrates with the per-request metrics store to accumulate DB query stats.
 */

import type { Logger } from 'drizzle-orm';
import { recordDbQuery } from './request-metrics';
import { logger } from './logger';

export class ObservabilityDrizzleLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    const start = performance.now();

    // Log at debug level for development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('db:query', {
        query: query.length > 200 ? query.slice(0, 200) + '...' : query,
        paramCount: params.length,
      });
    }

    // We can't await here since logQuery is sync.
    // Use a microtask to record timing after the query executes.
    // This is a rough approximation — accurate timing requires instrumentation
    // at the postgres.js driver level. For now, record a minimal cost.
    queueMicrotask(() => {
      const durationMs = Math.round(performance.now() - start);
      recordDbQuery(durationMs);
    });
  }
}
