/**
 * On-Call Runbooks — P0/P1 alert response procedures.
 *
 * Each runbook is a structured object for display in admin dashboards
 * and Slack alert attachments. Keep in sync with error-classification.ts.
 */

export interface RunbookStep {
  action: string;
  command?: string;
}

export interface Runbook {
  alertTitle: string;
  level: 'P0' | 'P1';
  symptoms: string[];
  diagnose: RunbookStep[];
  fix: RunbookStep[];
  escalation?: string;
}

export const runbooks: Runbook[] = [
  // ── P0: Database Connection Exhaustion ──
  {
    alertTitle: 'Database connection failure',
    level: 'P0',
    symptoms: [
      '503 errors on all endpoints',
      '"too many clients" in logs',
      'Health check returns unhealthy (database check fails)',
    ],
    diagnose: [
      { action: 'Check Supabase dashboard → Database → Connections' },
      {
        action: 'Check connection states',
        command: "SELECT state, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY state;",
      },
      {
        action: 'Look for idle-in-transaction connections (leaked transactions)',
        command: "SELECT pid, state, query, age(clock_timestamp(), query_start) AS duration FROM pg_stat_activity WHERE state = 'idle in transaction' ORDER BY duration DESC LIMIT 10;",
      },
    ],
    fix: [
      { action: 'If leaked transactions: identify the code path from the query column, fix, and deploy' },
      {
        action: 'Emergency: terminate idle-in-transaction connections older than 5 minutes',
        command: "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND query_start < NOW() - INTERVAL '5 minutes';",
      },
      { action: 'If legitimate load: increase pool size in Supabase dashboard or scale plan' },
    ],
    escalation: 'If connections keep growing after fix, escalate to Supabase support',
  },

  // ── P0: RLS Violation ──
  {
    alertTitle: 'RLS violation detected — possible tenant isolation breach',
    level: 'P0',
    symptoms: [
      'Alert with "tenant_isolation" or "row-level security" in error message',
      'Customer reports seeing another tenant\'s data',
    ],
    diagnose: [
      { action: 'Search logs for "tenant_isolation_violation" or "rls_violation"' },
      { action: 'Identify the endpoint and request from the log entry (requestId, path, tenantId)' },
      { action: 'Check if the endpoint uses withTenant() or withMiddleware() correctly' },
      {
        action: 'Verify RLS policies are active on the affected table',
        command: "SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = '<affected_table>';",
      },
    ],
    fix: [
      { action: 'IMMEDIATELY: disable the affected endpoint by returning 503 (emergency deploy)' },
      { action: 'Investigate: check if withTenant() was bypassed or if a raw query lacks tenant_id filter' },
      { action: 'Fix the RLS policy or add missing withTenant() wrapper' },
      { action: 'Test the fix in staging with two different tenants' },
      { action: 'Deploy fix and re-enable the endpoint' },
    ],
    escalation: 'If data was actually leaked, trigger incident response protocol',
  },

  // ── P0: Payment Processing Failures ──
  {
    alertTitle: 'Payment processing failures — 3+ in 5 minutes',
    level: 'P0',
    symptoms: [
      '500 errors on /api/v1/orders/*/tenders endpoints',
      'Customers unable to complete payment',
      'Cash drawer imbalanced',
    ],
    diagnose: [
      { action: 'Search logs for requestId values from the alert to see full error stack traces' },
      { action: 'Check if errors are specific to one tenant or location (tenant-specific vs system-wide)' },
      { action: 'Check if the tenders table is locked or has long-running transactions', command: "SELECT * FROM pg_locks WHERE relation = 'tenders'::regclass AND NOT granted;" },
      { action: 'Verify database is healthy: check /api/health endpoint' },
    ],
    fix: [
      { action: 'If lock contention: identify and terminate the blocking transaction' },
      { action: 'If data integrity error: check order version mismatch (optimistic locking failure)' },
      { action: 'If database down: follow Database Connection Exhaustion runbook' },
      { action: 'If code bug: revert to last known good deploy' },
    ],
  },

  // ── P1: 5xx Error Rate Elevated ──
  {
    alertTitle: '5xx error rate elevated — 5+ in 5 minutes',
    level: 'P1',
    symptoms: [
      'Multiple 500 errors across different endpoints',
      'Users reporting intermittent failures',
    ],
    diagnose: [
      { action: 'Check Vercel dashboard for deployment issues or cold start spikes' },
      { action: 'Check Sentry for the dominant error type (grouping)' },
      { action: 'Check database health: GET /api/health' },
      { action: 'Check if errors correlate with a recent deploy (Vercel deployments timeline)' },
    ],
    fix: [
      { action: 'If recent deploy caused it: rollback via Vercel dashboard' },
      { action: 'If database-related: follow Database Connection Exhaustion runbook' },
      { action: 'If single endpoint: add circuit breaker or temporarily disable' },
    ],
  },

  // ── P1: Event Outbox Lag ──
  {
    alertTitle: 'Event outbox lag detected',
    level: 'P1',
    symptoms: [
      'Events not being processed (inventory not deducting, AR not charging)',
      'Outbox pending count growing',
      'Oldest pending event age > 30 seconds',
    ],
    diagnose: [
      { action: 'Check admin event stats: GET /api/v1/admin/events/stats' },
      { action: 'Check dead-letter queue: GET /api/v1/admin/events/dlq' },
      {
        action: 'Check for stuck events',
        command: "SELECT id, event_type, created_at, age(now(), created_at) AS age FROM event_outbox WHERE published_at IS NULL ORDER BY created_at ASC LIMIT 10;",
      },
    ],
    fix: [
      { action: 'If outbox worker crashed: restart the application (Vercel redeploy)' },
      { action: 'If specific event type failing: check dead-letter queue for error details' },
      { action: 'Retry failed events: POST /api/v1/admin/events/dlq/{eventId}/retry' },
      { action: 'If event consumer has a bug: fix consumer, deploy, then retry DLQ events' },
    ],
  },

  // ── P1: Dead Letter Queue — Financial Job ──
  {
    alertTitle: 'Dead-letter event on financial job type',
    level: 'P1',
    symptoms: [
      'order.placed, order.voided, or tender.recorded events in DLQ',
      'Inventory not deducting after order placement',
      'AR not charging after house account order',
    ],
    diagnose: [
      { action: 'Check DLQ: GET /api/v1/admin/events/dlq' },
      { action: 'Identify the failing consumer from the error message' },
      { action: 'Check if the root data exists (e.g., does the order/tender/inventory item exist?)' },
    ],
    fix: [
      { action: 'If orphan reference: manually create the missing record, then retry the DLQ event' },
      { action: 'If consumer bug: fix, deploy, then retry DLQ events in order' },
      { action: 'Financial events MUST be resolved — do not ignore. Verify GL entries balance after fix.' },
    ],
    escalation: 'If financial data is inconsistent after retry, manual GL adjustment may be needed',
  },
];

/**
 * Find the runbook matching an alert title.
 */
export function findRunbook(alertTitle: string): Runbook | undefined {
  return runbooks.find(
    (r) => alertTitle.toLowerCase().includes(r.alertTitle.toLowerCase().slice(0, 30)),
  );
}
