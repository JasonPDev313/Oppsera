/**
 * Custom k6 metrics for OppsEra load tests.
 *
 * Tracks cold starts, endpoint-specific latencies,
 * and tenant isolation violations.
 */

import { Counter, Trend } from 'k6/metrics';

// --- Cold Start Metrics ---
export const coldStartCount = new Counter('cold_start_count');
export const coldStartDuration = new Trend('cold_start_duration', true);
export const warmDuration = new Trend('warm_duration', true);

// --- Endpoint-Specific Metrics ---
export const posItemLookupDuration = new Trend('pos_item_lookup_duration', true);
export const posStockCheckDuration = new Trend('pos_stock_check_duration', true);
export const posOrderCreationDuration = new Trend('pos_order_creation_duration', true);
export const orderHistoryListDuration = new Trend('order_history_list_duration', true);
export const dashboardAggregationDuration = new Trend('dashboard_aggregation_duration', true);
export const customerSearchDuration = new Trend('customer_search_duration', true);
export const settingsReadDuration = new Trend('settings_read_duration', true);

// --- Tenant Isolation ---
// Imported from assertions.js — re-exported here for convenience
// tenantIsolationViolations is defined in assertions.js

// --- DB Metrics (from response headers, if exposed) ---
export const dbQueryCount = new Trend('db_query_count');

/**
 * Record cold start vs warm metrics from response headers.
 * Reads X-Cold-Start and X-Function-Instance headers.
 *
 * @param {Object} response - k6 HTTP response
 */
export function recordColdStart(response) {
  const isColdStart = response.headers['X-Cold-Start'] === '1';
  const duration = response.timings.duration;

  if (isColdStart) {
    coldStartCount.add(1);
    coldStartDuration.add(duration);
  } else {
    warmDuration.add(duration);
  }

  // DB query count (if exposed via header)
  const queryCount = response.headers['X-Db-Query-Count'];
  if (queryCount) {
    dbQueryCount.add(parseInt(queryCount, 10));
  }
}

/**
 * Record an endpoint-specific metric.
 * Call after each request with the appropriate metric name.
 *
 * @param {string} metricName - One of the exported metric names
 * @param {Object} response - k6 HTTP response
 */
export function recordEndpointMetric(metricName, response) {
  const isColdStart = response.headers['X-Cold-Start'] === '1';
  // Only record warm invocations for endpoint-specific metrics
  if (isColdStart) return;

  const duration = response.timings.duration;

  switch (metricName) {
    case 'pos_item_lookup':
      posItemLookupDuration.add(duration);
      break;
    case 'pos_stock_check':
      posStockCheckDuration.add(duration);
      break;
    case 'pos_order_creation':
      posOrderCreationDuration.add(duration);
      break;
    case 'order_history_list':
      orderHistoryListDuration.add(duration);
      break;
    case 'dashboard_aggregation':
      dashboardAggregationDuration.add(duration);
      break;
    case 'customer_search':
      customerSearchDuration.add(duration);
      break;
    case 'settings_read':
      settingsReadDuration.add(duration);
      break;
  }
}
