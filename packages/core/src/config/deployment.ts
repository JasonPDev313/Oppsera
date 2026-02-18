/**
 * Deployment configuration — abstracts environment differences between
 * Vercel serverless, Docker containers, and local development.
 *
 * The goal: flipping environment variables handles 80% of migration.
 */

export type DeploymentTarget = 'vercel' | 'container' | 'local';

export interface DeploymentConfig {
  target: DeploymentTarget;
  region: string;
  isProduction: boolean;
  database: {
    url: string;
    readReplicaUrl?: string;
    poolSize: number;
  };
  redis: {
    url?: string;
    enabled: boolean;
  };
  auth: {
    supabaseUrl: string;
    supabaseAnonKey: string;
  };
  sentry: {
    dsn?: string;
    enabled: boolean;
  };
  alerts: {
    slackWebhookCritical?: string;
    slackWebhookHigh?: string;
    slackWebhookMedium?: string;
  };
}

function detectTarget(): DeploymentTarget {
  if (process.env.VERCEL) return 'vercel';
  if (process.env.ECS_CONTAINER_METADATA_URI) return 'container';
  return 'local';
}

let _config: DeploymentConfig | null = null;

export function getDeploymentConfig(): DeploymentConfig {
  if (_config) return _config;

  const target = detectTarget();

  _config = {
    target,
    region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'local',
    isProduction: process.env.NODE_ENV === 'production',
    database: {
      url: process.env.DATABASE_URL!,
      readReplicaUrl: process.env.DATABASE_READ_URL,
      // Vercel serverless: small pool (shared across cold starts)
      // Container: larger pool (persistent process)
      poolSize: target === 'vercel' ? 3 : target === 'container' ? 10 : 5,
    },
    redis: {
      url: process.env.REDIS_URL,
      enabled: !!process.env.REDIS_URL,
    },
    auth: {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    },
    sentry: {
      dsn: process.env.SENTRY_DSN,
      enabled: !!process.env.SENTRY_DSN,
    },
    alerts: {
      slackWebhookCritical: process.env.SLACK_WEBHOOK_CRITICAL,
      slackWebhookHigh: process.env.SLACK_WEBHOOK_HIGH,
      slackWebhookMedium: process.env.SLACK_WEBHOOK_MEDIUM,
    },
  };

  return _config;
}

/** Reset cached config (for testing) */
export function resetDeploymentConfig(): void {
  _config = null;
}
