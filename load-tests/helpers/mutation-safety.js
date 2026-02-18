/**
 * Mutation safety helpers for concurrent load testing.
 *
 * Prevents VU collisions on shared data:
 * - Deterministic tenant assignment (weighted by size)
 * - Per-VU item pools (no two VUs share items)
 * - Deterministic randomness for reproducibility
 * - Register ID isolation
 */

import { SharedArray } from 'k6/data';

// Load seed data manifest (item pools per tenant)
const seedManifest = new SharedArray('seed-manifest', function () {
  const path = __ENV.SEED_MANIFEST_PATH || './seed-manifest.json';
  try {
    return [JSON.parse(open(path))];
  } catch (e) {
    console.warn(`Seed manifest not found at ${path}, using fallback pools`);
    return [{ tenantItems: {} }];
  }
});

const manifest = seedManifest[0];

/**
 * Assign a tenant to a VU based on weighted distribution.
 * Large tenants get more VUs proportionally.
 *
 * @param {number} vuId - k6 __VU (1-based)
 * @param {Object} tenantWeights - { tenantIndex: weight } mapping
 * @returns {number} Assigned tenant index
 */
export function assignTenantToVU(vuId, tenantWeights) {
  const entries = Object.entries(tenantWeights).sort((a, b) => a[0] - b[0]);
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  const position = ((vuId - 1) % totalWeight);

  let cumulative = 0;
  for (const [tenantIndex, weight] of entries) {
    cumulative += weight;
    if (position < cumulative) {
      return parseInt(tenantIndex, 10);
    }
  }

  return parseInt(entries[0][0], 10);
}

/**
 * Default tenant weights matching seed distribution.
 * Stage 1: 10 tenants (2 large, 5 medium, 3 small)
 */
export const DEFAULT_TENANT_WEIGHTS = {
  1: 5,   // large
  2: 5,   // large
  3: 2,   // medium
  4: 2,   // medium
  5: 2,   // medium
  6: 2,   // medium
  7: 2,   // medium
  8: 1,   // small
  9: 1,   // small
  10: 1,  // small
};

/**
 * Get the item pool for a specific tenant and VU.
 * Items are partitioned across VUs to minimize write contention.
 *
 * @param {number} tenantIndex - 1-based tenant index
 * @param {number} vuId - k6 __VU
 * @param {number} poolSize - Items per VU pool (default: 20)
 * @returns {Object[]} Array of { itemId, catalogItemId, sku, name }
 */
export function getItemPool(tenantIndex, vuId, poolSize = 20) {
  const key = `T${String(tenantIndex).padStart(2, '0')}`;
  const tenantItems = manifest.tenantItems[key] || [];

  if (tenantItems.length === 0) {
    // Fallback: generate synthetic item IDs
    return generateFallbackPool(tenantIndex, vuId, poolSize);
  }

  // Partition items across VUs
  const startIdx = ((vuId - 1) * poolSize) % tenantItems.length;
  const pool = [];
  for (let i = 0; i < poolSize; i++) {
    pool.push(tenantItems[(startIdx + i) % tenantItems.length]);
  }
  return pool;
}

/**
 * Pick an available item from the pool.
 * Falls back to a random item if stock tracking isn't available.
 *
 * @param {Object[]} itemPool - From getItemPool()
 * @param {Set} [usedItems] - Items already used this iteration (optional)
 * @returns {Object} Selected item
 */
export function pickAvailableItem(itemPool, usedItems = new Set()) {
  // Prefer unused items
  for (const item of itemPool) {
    if (!usedItems.has(item.itemId || item.catalogItemId)) {
      return item;
    }
  }
  // All used — pick random from pool (items have high stock headroom)
  return itemPool[Math.floor(Math.random() * itemPool.length)];
}

/**
 * Generate a deterministic unique register ID for this VU + tenant.
 * No two VUs share a register within the same tenant.
 *
 * @param {number} tenantIndex
 * @param {number} vuId
 * @returns {string} Register ID like "T01_REG_005"
 */
export function getRegisterId(tenantIndex, vuId) {
  const pad = String(tenantIndex).padStart(2, '0');
  const regNum = String(vuId).padStart(3, '0');
  return `T${pad}_REG_${regNum}`;
}

/**
 * Create a seeded random number generator for reproducibility.
 * Each VU + iteration gets a deterministic sequence.
 *
 * @param {number} vuId - k6 __VU
 * @param {number} iteration - k6 __ITER
 * @returns {{ next: () => number, nextInt: (min, max) => number }}
 */
export function seededRandom(vuId, iteration) {
  let seed = (vuId * 1000 + iteration) | 0;

  function next() {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }

  function nextInt(min, max) {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  return { next, nextInt };
}

// --- Internal ---

function generateFallbackPool(tenantIndex, vuId, poolSize) {
  const prefix = `T${String(tenantIndex).padStart(2, '0')}`;
  const pool = [];
  const startSku = (vuId - 1) * poolSize + 1;
  for (let i = 0; i < poolSize; i++) {
    const skuNum = String(startSku + i).padStart(6, '0');
    pool.push({
      catalogItemId: `${prefix}_ITEM_${skuNum}`,
      sku: `${prefix}_SKU_${skuNum}`,
      name: `${prefix} Test Item ${startSku + i}`,
    });
  }
  return pool;
}
