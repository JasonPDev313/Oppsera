# OppsEra Load Testing Suite

k6-based load testing for the OppsEra multi-tenant SaaS ERP platform.

## Quick Start

```bash
# 1. Seed test data
npx tsx load-tests/scripts/seed-load-test.ts --profile stage1

# 2. Run CI-fast profile (< 5 minutes)
k6 run load-tests/profiles/ci-fast.js -e TARGET_ENV=staging

# 3. Or use the runner script
./load-tests/scripts/run.sh ci-fast --env staging
```

## Profiles

| Profile | Duration | VUs | When |
|---------|----------|-----|------|
| `ci-fast` | < 5 min | 1-10 | Every staging deploy |
| `nightly` | 30-60 min | 1-100 | Cron (2 AM UTC) |
| `release` | 2-4 hours | 1-300 | Before production release |

## Scenarios

| # | Scenario | Description |
|---|----------|-------------|
| 01 | Smoke | Quick sanity check (1 VU) |
| 02 | POS Checkout | Realistic terminal flow with think time |
| 03 | Lunch Rush | Sustained peak across all tenants |
| 04 | Report Storm | Reports + POS simultaneously |
| 05 | Bulk Import | Large item creation under POS load |
| 06 | Noisy Neighbor | Large tenant vs small tenant fairness |
| 07 | Connection Stress | Pool breaking point (synthetic) |
| 08 | Mixed Workload | Compressed business day simulation |
| 09 | Soak | 2hr extended test for memory leaks |
| 10 | RLS Isolation | Security gate — pass/fail only |

## Directory Structure

```
load-tests/
├── config/           # Environment, auth, thresholds, profiles
├── helpers/          # Shared k6 modules (api, assertions, metrics, etc.)
├── scenarios/        # Individual k6 test scripts
│   └── serverless/   # Cold start + concurrency ceiling
├── profiles/         # Composite profile runners (ci-fast, nightly, release)
├── scripts/          # Seed, teardown, verify, SQL analysis, run/compare
├── reports/          # Report template
└── results/          # Test output (gitignored)
```

## Seed Data

```bash
# Stage 1: 10 tenants, 100 items each
npx tsx load-tests/scripts/seed-load-test.ts --profile stage1

# Stage 2 Lite: 50 tenants, 500 items each
npx tsx load-tests/scripts/seed-load-test.ts --profile stage2-lite

# Verify seed data is adequate
npx tsx load-tests/scripts/verify-seed.ts --profile stage1

# Teardown (removes loadtest-tenant-* data)
npx tsx load-tests/scripts/teardown-load-test.ts
npx tsx load-tests/scripts/teardown-load-test.ts --dry-run  # preview
```

## SQL Analysis

```bash
# Before test: reset stats
psql $DATABASE_URL -f load-tests/scripts/reset_stats.sql

# After test: capture results
psql $DATABASE_URL -f load-tests/scripts/capture_results.sql

# Export for comparison
psql $DATABASE_URL -t -A -f load-tests/scripts/compare_baselines.sql > baseline.json
```

## CI Integration

The GitHub Actions workflow (`.github/workflows/load-test.yml`) runs:
- **On staging deploy**: ci-fast profile automatically
- **Nightly (2 AM UTC)**: nightly profile via cron
- **Manual**: Any profile via workflow_dispatch

Tenant isolation violations cause hard failures in CI.
