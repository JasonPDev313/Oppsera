/**
 * P95/P99 latency targets per endpoint category.
 * These apply to WARM invocations only (cold starts tracked separately).
 *
 * Used by all scenario files to configure k6 thresholds.
 */

// Warm invocation targets (milliseconds)
export const LATENCY_TARGETS = {
  pos_item_lookup:        { p95: 50,    p99: 100,   ceiling: 200   },
  pos_stock_check:        { p95: 50,    p99: 100,   ceiling: 200   },
  pos_order_creation:     { p95: 200,   p99: 400,   ceiling: 1000  },
  order_history_list:     { p95: 300,   p99: 500,   ceiling: 1000  },
  dashboard_aggregation:  { p95: 1000,  p99: 2000,  ceiling: 5000  },
  customer_search:        { p95: 200,   p99: 400,   ceiling: 1000  },
  settings_read:          { p95: 50,    p99: 100,   ceiling: 200   },
  bulk_price_update:      { p95: 1000,  p99: 2000,  ceiling: 5000  },
  report_generation:      { p95: 30000, p99: 60000, ceiling: 120000 },
  cold_start:             { p95: 1500,  p99: 2500,  ceiling: 3000  },
};

// Import throughput targets
export const THROUGHPUT_TARGETS = {
  bulk_import_rows_per_sec: { target: 500, minimum: 200, hard_floor: 100 },
};

// Tenant isolation — hard gate
export const ISOLATION_THRESHOLDS = {
  tenant_isolation_violations: 0, // ANY violation = test fails
  cross_tenant_namespace_leaks: 0,
};

/**
 * Build k6 thresholds object from targets.
 * @param {string[]} categories - Which endpoint categories this scenario tests
 * @returns {Object} k6-compatible thresholds
 */
export function buildThresholds(categories = []) {
  const thresholds = {
    // Global defaults
    http_req_failed: ['rate<0.01'],  // <1% error rate
    'tenant_isolation_violations': ['count==0'],

    // Warm vs cold tracking
    'warm_duration': ['p(95)<1000'],
    'cold_start_duration': [`p(95)<${LATENCY_TARGETS.cold_start.p95}`],
  };

  for (const cat of categories) {
    const target = LATENCY_TARGETS[cat];
    if (target) {
      thresholds[`${cat}_duration`] = [
        `p(95)<${target.p95}`,
        `p(99)<${target.p99}`,
        `max<${target.ceiling}`,
      ];
    }
  }

  return thresholds;
}
