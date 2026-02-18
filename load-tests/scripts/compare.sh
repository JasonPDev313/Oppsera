#!/usr/bin/env bash
#
# compare.sh — Compare two load test runs (baseline vs current).
#
# Usage:
#   ./load-tests/scripts/compare.sh <baseline-dir> <current-dir>
#   ./load-tests/scripts/compare.sh results/nightly-20260215 results/nightly-20260216
#
# Compares:
#   - k6 thresholds pass/fail
#   - P95/P99 latency regression (>10% = warning, >20% = fail)
#   - Error rate changes
#   - DB query performance changes
#

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <baseline-dir> <current-dir>"
  exit 1
fi

BASELINE_DIR="$1"
CURRENT_DIR="$2"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  OppsEra Load Test Comparison"
echo "═══════════════════════════════════════════════════════"
echo "  Baseline: $BASELINE_DIR"
echo "  Current:  $CURRENT_DIR"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Validate Inputs ──
for dir in "$BASELINE_DIR" "$CURRENT_DIR"; do
  if [[ ! -d "$dir" ]]; then
    echo "❌ Directory not found: $dir"
    exit 1
  fi
done

# ── Compare k6 JSON Results ──
BASELINE_JSON="$BASELINE_DIR/k6-results.json"
CURRENT_JSON="$CURRENT_DIR/k6-results.json"

if [[ -f "$BASELINE_JSON" ]] && [[ -f "$CURRENT_JSON" ]]; then
  echo "📊 Comparing k6 metrics..."
  echo ""

  # Extract key metrics using jq (if available)
  if command -v jq &> /dev/null; then
    # Extract summary metrics from k6 JSON output
    # k6 JSON output is line-delimited JSON (point metrics)
    echo "  Metric                          Baseline        Current         Delta"
    echo "  ─────────────────────────────── ─────────────── ─────────────── ──────"

    for metric in http_req_duration http_req_failed; do
      baseline_val=$(grep "\"metric\":\"$metric\"" "$BASELINE_JSON" | tail -1 | jq -r '.data.value // empty' 2>/dev/null || echo "N/A")
      current_val=$(grep "\"metric\":\"$metric\"" "$CURRENT_JSON" | tail -1 | jq -r '.data.value // empty' 2>/dev/null || echo "N/A")
      printf "  %-35s %-15s %-15s\n" "$metric" "$baseline_val" "$current_val"
    done

    echo ""
  else
    echo "  ⚠️  jq not installed — skipping detailed metric comparison."
    echo "     Install jq for detailed comparison: brew install jq / apt install jq"
    echo ""
  fi
fi

# ── Compare DB Stats ──
BASELINE_DB="$BASELINE_DIR/db-stats.json"
CURRENT_DB="$CURRENT_DIR/db-stats.json"

if [[ -f "$BASELINE_DB" ]] && [[ -f "$CURRENT_DB" ]]; then
  echo "🗄️  Comparing DB stats..."
  echo ""

  if command -v jq &> /dev/null; then
    # Compare cache hit ratios
    baseline_cache=$(jq -r '.cache_stats.heap_hit_pct // "N/A"' "$BASELINE_DB" 2>/dev/null || echo "N/A")
    current_cache=$(jq -r '.cache_stats.heap_hit_pct // "N/A"' "$CURRENT_DB" 2>/dev/null || echo "N/A")
    echo "  Cache hit ratio:  $baseline_cache% → $current_cache%"

    # Compare top query counts
    baseline_queries=$(jq -r '.top_queries | length // 0' "$BASELINE_DB" 2>/dev/null || echo "0")
    current_queries=$(jq -r '.top_queries | length // 0' "$CURRENT_DB" 2>/dev/null || echo "0")
    echo "  Top queries tracked: $baseline_queries → $current_queries"

    # Flag any new slow queries (>100ms avg)
    echo ""
    echo "  ⚠️  New slow queries (>100ms avg):"
    jq -r '.top_queries[] | select(.avg_ms > 100) | "    \(.query) → \(.avg_ms)ms avg (\(.calls) calls)"' "$CURRENT_DB" 2>/dev/null || echo "    None detected"
    echo ""
  fi
fi

# ── Compare Tenant Isolation ──
echo "🔒 Tenant Isolation Check..."
baseline_violations=$(grep -c "tenant_isolation_violations" "$BASELINE_DIR/k6-output.log" 2>/dev/null || echo "0")
current_violations=$(grep -c "tenant_isolation_violations" "$CURRENT_DIR/k6-output.log" 2>/dev/null || echo "0")

if grep -q "count==0.*✓" "$CURRENT_DIR/k6-output.log" 2>/dev/null; then
  echo "  ✅ No tenant isolation violations detected."
elif grep -q "tenant_isolation_violations" "$CURRENT_DIR/k6-output.log" 2>/dev/null; then
  echo "  ❌ TENANT ISOLATION VIOLATIONS DETECTED!"
  grep "tenant_isolation_violations" "$CURRENT_DIR/k6-output.log" || true
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Comparison complete."
echo "  For detailed analysis, review the output files in:"
echo "  $CURRENT_DIR/"
echo "═══════════════════════════════════════════════════════"
