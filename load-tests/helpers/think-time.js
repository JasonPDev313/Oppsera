/**
 * Realistic think time models for different user types.
 *
 * POS terminal: burst pattern (fast scans, pauses between customers)
 * Manager/back-office: browse pattern (page loads, report viewing)
 * Dashboard: periodic pattern (auto-refresh)
 *
 * All functions use k6 sleep() internally.
 */

import { sleep } from 'k6';

// --- POS Terminal ---

/** Between item scans: 1-3 seconds (uniform) */
export function posTerminalScan() {
  sleep(uniform(1, 3));
}

/** Between customers: 5-15 seconds (uniform) */
export function posTerminalCustomer() {
  sleep(uniform(5, 15));
}

/** Payment to next customer: 3-8 seconds (uniform) */
export function posTerminalPayment() {
  sleep(uniform(3, 8));
}

// --- Manager / Back-Office ---

/** Page load to next action: 3-10 seconds (log-normal, median 5s) */
export function managerBrowse() {
  sleep(logNormal(5, 0.5));
}

/** After viewing report: 10-30 seconds (uniform) */
export function managerReport() {
  sleep(uniform(10, 30));
}

// --- Dashboard ---

/** Dashboard refresh interval: 30-60 seconds (uniform) */
export function dashboardRefresh() {
  sleep(uniform(30, 60));
}

// --- Utility ---

/** Short pause for page transitions: 0.5-1.5s */
export function shortPause() {
  sleep(uniform(0.5, 1.5));
}

/** No think time — explicitly labeled for stress tests */
export function noThinkTime() {
  // Intentionally empty — connection stress tests only
}

// --- Distribution helpers ---

/**
 * Uniform random between min and max.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function uniform(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Log-normal distribution with given median and sigma.
 * Clamps to reasonable bounds (1s - 60s).
 * @param {number} median - Desired median value
 * @param {number} sigma - Standard deviation of the log
 * @returns {number}
 */
function logNormal(median, sigma) {
  const mu = Math.log(median);
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const value = Math.exp(mu + sigma * z);
  return Math.max(1, Math.min(60, value));
}
