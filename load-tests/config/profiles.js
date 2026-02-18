/**
 * Execution profiles: ci-fast, nightly, release.
 *
 * Each profile defines which scenarios to run, at what VU counts,
 * and with which seed data profile.
 */

export const PROFILES = {
  'ci-fast': {
    description: 'Quick validation (<5 min). Runs on every staging deploy.',
    seedProfile: 'stage1',
    reSeed: false,       // Use pre-seeded data
    totalDuration: '5m',
    scenarios: {
      smoke: { vus: 1, duration: '30s' },
      pos_checkout: { vus: 5, duration: '2m' },
      rls_isolation: { vus: 10, duration: '1m' },
    },
  },

  nightly: {
    description: 'Full suite at Stage 1 volume (30-60 min).',
    seedProfile: 'stage1',
    reSeed: false,       // Verify seed before run, re-seed if stale
    totalDuration: '60m',
    scenarios: {
      smoke: { vus: 1, duration: '30s' },
      pos_checkout: {
        stages: [
          { duration: '2m', target: 15 },
          { duration: '5m', target: 15 },
          { duration: '1m', target: 0 },
        ],
      },
      lunch_rush: {
        stages: [
          { duration: '5m', target: 100 },
          { duration: '20m', target: 100 },
          { duration: '5m', target: 20 },
        ],
      },
      report_storm: { vus: 25, duration: '10m' },
      bulk_import: { vus: 30, duration: '10m' },
      noisy_neighbor: { vus: 100, duration: '10m' },
      mixed_workload: {
        stages: [
          { duration: '5m', target: 6 },
          { duration: '5m', target: 15 },
          { duration: '8m', target: 30 },
          { duration: '5m', target: 18 },
          { duration: '4m', target: 27 },
          { duration: '3m', target: 9 },
        ],
      },
      rls_isolation: { vus: 50, duration: '5m' },
    },
  },

  release: {
    description: 'Full suite at Stage 2 volume + soak (2-4 hours).',
    seedProfile: 'stage2-lite',
    reSeed: true,        // Re-seed before run
    totalDuration: '4h',
    scenarios: {
      smoke: { vus: 1, duration: '30s' },
      pos_checkout: {
        stages: [
          { duration: '5m', target: 150 },
          { duration: '10m', target: 150 },
          { duration: '3m', target: 0 },
        ],
      },
      lunch_rush: {
        stages: [
          { duration: '5m', target: 100 },
          { duration: '20m', target: 100 },
          { duration: '5m', target: 20 },
        ],
      },
      report_storm: { vus: 25, duration: '15m' },
      bulk_import: { vus: 30, duration: '10m' },
      noisy_neighbor: { vus: 100, duration: '15m' },
      connection_stress: {
        stages: [
          { duration: '15m', target: 300 },
        ],
      },
      mixed_workload: {
        stages: [
          { duration: '5m', target: 60 },
          { duration: '5m', target: 150 },
          { duration: '8m', target: 300 },
          { duration: '5m', target: 180 },
          { duration: '4m', target: 270 },
          { duration: '3m', target: 90 },
        ],
      },
      soak: { vus: 75, duration: '2h' },
      rls_isolation: { vus: 50, duration: '10m' },
    },
  },
};

export function getProfile(name) {
  const profile = PROFILES[name];
  if (!profile) {
    throw new Error(`Unknown profile: ${name}. Valid: ${Object.keys(PROFILES).join(', ')}`);
  }
  return profile;
}
