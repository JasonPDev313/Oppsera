#!/usr/bin/env bash
#
# run.sh — Execute a k6 load test profile with pre/post steps.
#
# Usage:
#   ./load-tests/scripts/run.sh ci-fast
#   ./load-tests/scripts/run.sh nightly --env staging
#   ./load-tests/scripts/run.sh release --env staging --seed
#
# Options:
#   --env <name>     Target environment (default: staging)
#   --seed           Re-seed data before running
#   --verify-only    Only verify seed data, don't run tests
#   --no-stats       Skip pg_stat_statements reset/capture
#   --output <dir>   Output directory (default: load-tests/results/<profile>-<timestamp>)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOAD_DIR="$ROOT_DIR/load-tests"

# ── Parse Arguments ──
PROFILE="${1:-ci-fast}"
shift || true

TARGET_ENV="staging"
DO_SEED=false
VERIFY_ONLY=false
NO_STATS=false
OUTPUT_DIR=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) TARGET_ENV="$2"; shift 2 ;;
    --seed) DO_SEED=true; shift ;;
    --verify-only) VERIFY_ONLY=true; shift ;;
    --no-stats) NO_STATS=true; shift ;;
    --output) OUTPUT_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Validate Profile ──
PROFILE_FILE="$LOAD_DIR/profiles/$PROFILE.js"
if [[ ! -f "$PROFILE_FILE" ]]; then
  echo "❌ Profile not found: $PROFILE_FILE"
  echo "   Available profiles: ci-fast, nightly, release"
  exit 1
fi

# ── Setup Output Directory ──
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$LOAD_DIR/results/${PROFILE}-${TIMESTAMP}"
fi
mkdir -p "$OUTPUT_DIR"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  OppsEra Load Test Runner"
echo "═══════════════════════════════════════════════════════"
echo "  Profile:     $PROFILE"
echo "  Environment: $TARGET_ENV"
echo "  Output:      $OUTPUT_DIR"
echo "  Seed:        $DO_SEED"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Step 1: Verify Seed Data ──
echo "📋 Step 1: Verifying seed data..."

SEED_PROFILE="stage1"
if [[ "$PROFILE" == "release" ]]; then
  SEED_PROFILE="stage2-lite"
fi

if npx tsx "$LOAD_DIR/scripts/verify-seed.ts" --profile "$SEED_PROFILE" 2>/dev/null; then
  echo "✅ Seed data verified."
else
  if [[ "$DO_SEED" == true ]] || [[ "$PROFILE" == "release" ]]; then
    echo "🌱 Re-seeding data (profile: $SEED_PROFILE)..."
    npx tsx "$LOAD_DIR/scripts/seed-load-test.ts" --profile "$SEED_PROFILE"
  else
    echo "⚠️  Seed data insufficient. Run with --seed to re-seed."
    echo "    npx tsx load-tests/scripts/seed-load-test.ts --profile $SEED_PROFILE"
    exit 1
  fi
fi

if [[ "$VERIFY_ONLY" == true ]]; then
  echo "✅ Verify-only mode. Exiting."
  exit 0
fi

# ── Step 2: Reset Stats ──
if [[ "$NO_STATS" != true ]] && [[ -n "${DATABASE_URL:-}" ]]; then
  echo ""
  echo "📊 Step 2: Resetting pg_stat_statements..."
  psql "$DATABASE_URL" -f "$LOAD_DIR/scripts/reset_stats.sql" > "$OUTPUT_DIR/stats-reset.log" 2>&1 || {
    echo "⚠️  Stats reset failed (pg_stat_statements may not be available). Continuing..."
  }
fi

# ── Step 3: Run k6 ──
echo ""
echo "🚀 Step 3: Running k6 ($PROFILE profile)..."
echo ""

K6_ARGS=(
  run
  --out "json=$OUTPUT_DIR/k6-results.json"
  -e "TARGET_ENV=$TARGET_ENV"
  -e "AUTH_TOKENS_PATH=$LOAD_DIR/auth-tokens.json"
  -e "DATA_POOL_PATH=$LOAD_DIR/seed-manifest.json"
)

# Add environment-specific settings
if [[ -n "${STAGING_URL:-}" ]]; then
  K6_ARGS+=(-e "STAGING_URL=$STAGING_URL")
fi

k6 "${K6_ARGS[@]}" "$PROFILE_FILE" 2>&1 | tee "$OUTPUT_DIR/k6-output.log"

K6_EXIT=${PIPESTATUS[0]}

# ── Step 4: Capture DB Stats ──
if [[ "$NO_STATS" != true ]] && [[ -n "${DATABASE_URL:-}" ]]; then
  echo ""
  echo "📊 Step 4: Capturing DB stats..."
  psql "$DATABASE_URL" -f "$LOAD_DIR/scripts/capture_results.sql" > "$OUTPUT_DIR/db-stats.txt" 2>&1 || {
    echo "⚠️  Stats capture failed. Continuing..."
  }
  psql "$DATABASE_URL" -t -A -f "$LOAD_DIR/scripts/compare_baselines.sql" > "$OUTPUT_DIR/db-stats.json" 2>&1 || true
fi

# ── Step 5: Generate Summary ──
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Results Summary"
echo "═══════════════════════════════════════════════════════"
echo "  k6 exit code: $K6_EXIT"
echo "  Output:       $OUTPUT_DIR/"
echo "  Files:"
echo "    - k6-results.json (raw metrics)"
echo "    - k6-output.log (console output)"
[[ -f "$OUTPUT_DIR/db-stats.txt" ]] && echo "    - db-stats.txt (SQL analysis)"
[[ -f "$OUTPUT_DIR/db-stats.json" ]] && echo "    - db-stats.json (baseline comparison)"
echo "═══════════════════════════════════════════════════════"

if [[ $K6_EXIT -ne 0 ]]; then
  echo ""
  echo "❌ Load test FAILED (exit code: $K6_EXIT)"
  echo "   Check $OUTPUT_DIR/k6-output.log for details."
  exit $K6_EXIT
fi

echo ""
echo "✅ Load test PASSED"
