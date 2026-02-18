/**
 * Environment configuration for load tests.
 * Select environment via __ENV.TARGET_ENV (default: 'staging').
 *
 * Usage: k6 run -e TARGET_ENV=staging scenarios/01-smoke.js
 */

const ENVIRONMENTS = {
  local: {
    baseUrl: 'http://localhost:3000',
    supabaseUrl: 'http://localhost:54321',
    isServerless: false,
    coldStartTracking: false,
    connectionPoolLimit: 20,
    notes: 'Local Docker Compose — full Postgres config control',
  },
  staging: {
    baseUrl: __ENV.STAGING_URL || 'https://oppsera-staging.vercel.app',
    supabaseUrl: __ENV.SUPABASE_URL || '',
    isServerless: true,
    coldStartTracking: true,
    connectionPoolLimit: 200, // Supabase pooler limit
    notes: 'Vercel Preview + Supabase staging project',
  },
  production: {
    baseUrl: __ENV.PROD_URL || '',
    supabaseUrl: '',
    isServerless: true,
    coldStartTracking: true,
    connectionPoolLimit: 200,
    notes: 'NEVER run full load tests against production',
  },
  vps: {
    baseUrl: __ENV.VPS_URL || '',
    supabaseUrl: '',
    isServerless: false,
    coldStartTracking: false,
    connectionPoolLimit: 100, // Self-hosted PgBouncer
    notes: 'Docker Compose on VPS — Stage 3 target',
  },
};

export function getEnvironment() {
  const envName = __ENV.TARGET_ENV || 'staging';
  const env = ENVIRONMENTS[envName];
  if (!env) {
    throw new Error(`Unknown environment: ${envName}. Valid: ${Object.keys(ENVIRONMENTS).join(', ')}`);
  }
  return { ...env, name: envName };
}

export const BASE_URL = getEnvironment().baseUrl;
