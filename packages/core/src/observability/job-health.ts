/**
 * Background job / event outbox health monitoring.
 *
 * Queries the event_outbox and processed_events tables for health metrics.
 * Used by the automated health check and admin dashboard.
 */

import { db, sql } from '@oppsera/db';
import { sendAlert } from './alerts';
import { logger } from './logger';

export const jobHealth = {
  /** Outbox queue metrics */
  async outboxMetrics() {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE published_at IS NULL) AS pending_count,
        COUNT(*) FILTER (WHERE published_at IS NOT NULL AND published_at > NOW() - INTERVAL '24 hours') AS published_24h,
        COUNT(*) AS total_count,
        MIN(created_at) FILTER (WHERE published_at IS NULL) AS oldest_pending_at,
        EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE published_at IS NULL))) AS oldest_pending_age_secs
      FROM event_outbox
    `);
    const rows = Array.from(result as Iterable<Record<string, unknown>>);
    return rows[0] ?? {};
  },

  /** Event processing metrics by event type */
  async processingMetrics() {
    const result = await db.execute(sql`
      SELECT
        e.event_type,
        COUNT(*) FILTER (WHERE e.published_at IS NOT NULL) AS published,
        COUNT(*) FILTER (WHERE e.published_at IS NULL) AS pending,
        COUNT(DISTINCT p.consumer_name) AS consumer_count,
        AVG(EXTRACT(EPOCH FROM (p.processed_at - e.created_at))) AS avg_latency_secs
      FROM event_outbox e
      LEFT JOIN processed_events p ON p.event_id = e.event_id
      WHERE e.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY e.event_type
      ORDER BY pending DESC, published DESC
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Event throughput by hour (last 24h) */
  async throughputByHour() {
    const result = await db.execute(sql`
      SELECT
        date_trunc('hour', published_at) AS hour,
        COUNT(*) AS event_count
      FROM event_outbox
      WHERE published_at > NOW() - INTERVAL '24 hours'
      GROUP BY date_trunc('hour', published_at)
      ORDER BY hour DESC
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Check for stale/stuck events (unpublished for > threshold) */
  async staleEvents(thresholdSecs: number = 30) {
    const result = await db.execute(sql`
      SELECT
        id,
        event_type,
        event_id,
        tenant_id,
        created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at)) AS age_secs
      FROM event_outbox
      WHERE published_at IS NULL
        AND created_at < NOW() - MAKE_INTERVAL(secs => ${thresholdSecs})
      ORDER BY created_at ASC
      LIMIT 20
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Consumer processing stats */
  async consumerStats() {
    const result = await db.execute(sql`
      SELECT
        consumer_name,
        COUNT(*) AS total_processed,
        COUNT(*) FILTER (WHERE processed_at > NOW() - INTERVAL '24 hours') AS processed_24h,
        MAX(processed_at) AS last_processed_at
      FROM processed_events
      GROUP BY consumer_name
      ORDER BY total_processed DESC
    `);
    return Array.from(result as Iterable<Record<string, unknown>>);
  },

  /** Run health check with alerting */
  async runHealthCheck() {
    const metrics = await this.outboxMetrics();
    const stale = await this.staleEvents(30);

    const pendingCount = Number(metrics.pending_count ?? 0);
    const oldestAgeSecs = Number(metrics.oldest_pending_age_secs ?? 0);

    // Alert: Queue depth > 500
    if (pendingCount > 500) {
      await sendAlert({
        level: 'P1',
        title: 'Event outbox queue depth high',
        details: `${pendingCount} events pending. Oldest: ${oldestAgeSecs.toFixed(0)}s ago.`,
        context: { pendingCount, oldestAgeSecs },
      });
    }

    // Alert: Outbox lag > 30s
    if (oldestAgeSecs > 30) {
      await sendAlert({
        level: 'P1',
        title: 'Event outbox lag detected',
        details: `Oldest unpublished event is ${oldestAgeSecs.toFixed(0)}s old. Outbox worker may be down.`,
        context: { oldestAgeSecs, staleCount: stale.length },
      });
    }

    logger.info('Job health check completed', {
      pendingCount,
      oldestAgeSecs,
      staleEvents: stale.length,
      published24h: Number(metrics.published_24h ?? 0),
    });

    return {
      pendingCount,
      oldestAgeSecs,
      staleEvents: stale,
      published24h: Number(metrics.published_24h ?? 0),
      status: pendingCount > 500 || oldestAgeSecs > 30 ? 'warning' : 'healthy',
    };
  },
};
