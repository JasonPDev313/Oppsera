/**
 * Serverless Cold Start Profiler
 *
 * Measures cold start frequency and duration on Vercel.
 * Sends requests after configurable idle periods to trigger new function instances.
 *
 * Metrics:
 *   - cold_start_count: total cold starts detected
 *   - cold_start_duration: latency of cold-started requests
 *   - warm_duration: latency of warm requests (baseline)
 *   - cold_start_ratio: percentage of requests that hit cold starts
 *
 * Usage: k6 run scenarios/serverless/cold-start-profile.js -e TARGET_ENV=staging
 */

import { check, sleep } from 'k6';
import { getAuthForTenant } from '../../config/auth.js';
import { authenticatedGet } from '../../helpers/api.js';
import { Trend, Counter, Rate } from 'k6/metrics';

const coldStartLatency = new Trend('cold_start_latency', true);
const warmStartLatency = new Trend('warm_start_latency', true);
const coldStartDetected = new Counter('cold_start_detected');
const coldStartRate = new Rate('cold_start_rate');

export const options = {
  scenarios: {
    // Phase 1: Rapid-fire to establish warm baseline (2 min)
    warm_baseline: {
      executor: 'constant-vus',
      vus: 3,
      duration: '2m',
      exec: 'warmBaseline',
    },
    // Phase 2: Spaced requests to trigger cold starts
    // 30s idle between bursts
    cold_probe_30s: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 10,
      maxDuration: '10m',
      startTime: '3m',
      exec: 'coldProbe30s',
    },
    // 60s idle between bursts
    cold_probe_60s: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 10,
      maxDuration: '15m',
      startTime: '14m',
      exec: 'coldProbe60s',
    },
    // 120s idle between bursts
    cold_probe_120s: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 5,
      maxDuration: '15m',
      startTime: '30m',
      exec: 'coldProbe120s',
    },
  },
  thresholds: {
    // No hard thresholds — this is a measurement profile
    'cold_start_latency': ['p(95)<3000'], // Cold starts should be <3s
    'warm_start_latency': ['p(95)<300'],  // Warm should be <300ms
  },
};

const ENDPOINTS = [
  '/api/v1/catalog/items?limit=5',
  '/api/v1/orders?limit=5',
  '/api/v1/customers?limit=5',
  '/api/v1/inventory?limit=5',
];

function isColdStart(res) {
  // Check Vercel-specific headers
  const coldHeader = res.headers['X-Cold-Start'] || res.headers['x-cold-start'];
  if (coldHeader === 'true' || coldHeader === '1') return true;

  // Heuristic: if no cold start header, check function instance header
  const instance = res.headers['X-Function-Instance'] || res.headers['x-function-instance'];
  // New instance IDs suggest cold start (tracked per-VU)
  return false;
}

function probeEndpoints(auth, idleSec) {
  for (const path of ENDPOINTS) {
    const res = authenticatedGet(path, auth);
    const cold = isColdStart(res);

    check(res, {
      [`cold-probe (${idleSec}s idle): 200`]: (r) => r.status === 200,
    });

    if (res.status === 200) {
      if (cold) {
        coldStartLatency.add(res.timings.duration);
        coldStartDetected.add(1);
        coldStartRate.add(1);
        console.log(`🧊 Cold start detected: ${path} → ${res.timings.duration.toFixed(0)}ms (after ${idleSec}s idle)`);
      } else {
        warmStartLatency.add(res.timings.duration);
        coldStartRate.add(0);
      }
    }
  }
}

/** Phase 1: Continuous requests to warm all function instances */
export function warmBaseline() {
  const auth = getAuthForTenant(1);
  for (const path of ENDPOINTS) {
    const res = authenticatedGet(path, auth);
    if (res.status === 200) {
      warmStartLatency.add(res.timings.duration);
      coldStartRate.add(isColdStart(res) ? 1 : 0);
    }
  }
  sleep(1);
}

/** Phase 2a: 30s idle between probes */
export function coldProbe30s() {
  sleep(30);
  const auth = getAuthForTenant(1);
  probeEndpoints(auth, 30);
}

/** Phase 2b: 60s idle between probes */
export function coldProbe60s() {
  sleep(60);
  const auth = getAuthForTenant(1);
  probeEndpoints(auth, 60);
}

/** Phase 2c: 120s idle between probes */
export function coldProbe120s() {
  sleep(120);
  const auth = getAuthForTenant(1);
  probeEndpoints(auth, 120);
}
