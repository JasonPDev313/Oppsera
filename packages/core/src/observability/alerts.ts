/**
 * Alerting utility — routes alerts to Slack webhook by severity level.
 *
 * Alert deduplication: same (level + title) within cooldown window is suppressed.
 * Channels:
 *   P0 (critical) → SLACK_WEBHOOK_CRITICAL → #alerts-critical
 *   P1 (high)     → SLACK_WEBHOOK_HIGH     → #alerts-high
 *   P2 (medium)   → SLACK_WEBHOOK_MEDIUM   → #alerts-medium
 *   P3 (low)      → logged only
 */

import { logger } from './logger';

export type AlertLevel = 'P0' | 'P1' | 'P2' | 'P3';

export interface AlertPayload {
  level: AlertLevel;
  title: string;
  details: string;
  tenantId?: string;
  context?: Record<string, unknown>;
}

// Deduplication: track (level+title) → last sent timestamp
const recentAlerts = new Map<string, number>();
const DEDUP_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function isDuplicate(key: string): boolean {
  const lastSent = recentAlerts.get(key);
  if (!lastSent) return false;
  return Date.now() - lastSent < DEDUP_COOLDOWN_MS;
}

function markSent(key: string): void {
  recentAlerts.set(key, Date.now());
  // Prune old entries every 100 alerts
  if (recentAlerts.size > 200) {
    const cutoff = Date.now() - DEDUP_COOLDOWN_MS;
    for (const [k, v] of recentAlerts) {
      if (v < cutoff) recentAlerts.delete(k);
    }
  }
}

function getWebhookUrl(level: AlertLevel): string | undefined {
  switch (level) {
    case 'P0': return process.env.SLACK_WEBHOOK_CRITICAL;
    case 'P1': return process.env.SLACK_WEBHOOK_HIGH;
    case 'P2': return process.env.SLACK_WEBHOOK_MEDIUM;
    case 'P3': return undefined; // Log only
  }
}

function buildSlackPayload(alert: AlertPayload): object {
  const emoji = alert.level === 'P0' ? ':rotating_light:' : alert.level === 'P1' ? ':warning:' : ':information_source:';
  const color = alert.level === 'P0' ? '#dc2626' : alert.level === 'P1' ? '#f59e0b' : '#3b82f6';

  return {
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `${emoji} [${alert.level}] ${alert.title}` },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: alert.details },
          },
          ...(alert.tenantId
            ? [{
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `*Tenant:* ${alert.tenantId}` }],
              }]
            : []),
          ...(alert.context
            ? [{
                type: 'section',
                text: { type: 'mrkdwn', text: '```\n' + JSON.stringify(alert.context, null, 2) + '\n```' },
              }]
            : []),
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `*Time:* ${new Date().toISOString()}` }],
          },
        ],
      },
    ],
  };
}

export async function sendAlert(alert: AlertPayload): Promise<void> {
  const dedupKey = `${alert.level}:${alert.title}`;

  // Always log
  logger[alert.level === 'P0' || alert.level === 'P1' ? 'error' : 'warn'](
    `[ALERT:${alert.level}] ${alert.title}`,
    { alertLevel: alert.level, details: alert.details, tenantId: alert.tenantId },
  );

  // Check deduplication
  if (isDuplicate(dedupKey)) {
    logger.debug(`Alert suppressed (dedup): ${dedupKey}`);
    return;
  }

  const webhookUrl = getWebhookUrl(alert.level);
  if (!webhookUrl) return; // P3 = log only

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSlackPayload(alert)),
    });

    if (!response.ok) {
      logger.error('Failed to send Slack alert', {
        statusCode: response.status,
        alertLevel: alert.level,
        alertTitle: alert.title,
      });
    } else {
      markSent(dedupKey);
    }
  } catch (err) {
    logger.error('Slack webhook request failed', {
      error: { message: err instanceof Error ? err.message : String(err) },
      alertLevel: alert.level,
    });
  }
}
