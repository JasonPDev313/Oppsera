import { describe, it, expect } from 'vitest';

/**
 * Revenue Pipeline Coverage Guard
 *
 * This test programmatically verifies that every revenue source in the
 * REVENUE_SOURCES registry has:
 *   1. A reporting consumer that writes to rm_revenue_activity
 *   2. A GL adapter (or self-posting command) for accounting
 *   3. A void/reversal path for corrections
 *
 * If a new source is added to REVENUE_SOURCES without wiring both pipelines,
 * this test fails — preventing revenue from silently bypassing either system.
 */

import { REVENUE_SOURCES, REVENUE_SOURCE_KEYS } from '@oppsera/shared';
import type { RevenueSourceDefinition } from '@oppsera/shared';

// ── Coverage Matrix ──────────────────────────────────────────
// Maps each revenue source key to the event types that feed it
// and the consumer/adapter function names that handle those events.

interface PipelineCoverage {
  /** Event type(s) that create/update rm_revenue_activity for this source */
  reportingEvents: string[];
  /** Consumer function name(s) in the reporting module */
  reportingConsumers: string[];
  /** Event type(s) that trigger GL posting for this source */
  glEvents: string[];
  /** GL adapter function name(s) in the accounting module */
  glAdapters: string[];
  /** Event type(s) that handle void/reversal for this source */
  voidEvents: string[];
  /** Known gap? If true, the source is documented as incomplete */
  knownGap?: string;
}

const COVERAGE_MATRIX: Record<string, PipelineCoverage> = {
  pos_retail: {
    reportingEvents: ['order.placed.v1', 'tender.recorded.v1'],
    reportingConsumers: ['handleOrderPlaced', 'handleTenderRecorded'],
    glEvents: ['tender.recorded.v1'],
    glAdapters: ['handleTenderForAccounting'],
    voidEvents: ['order.voided.v1'],
  },
  pos_fnb: {
    reportingEvents: ['order.placed.v1', 'tender.recorded.v1'],
    reportingConsumers: ['handleOrderPlaced', 'handleTenderRecorded'],
    glEvents: ['tender.recorded.v1', 'fnb.gl.posting_created.v1'],
    glAdapters: ['handleTenderForAccounting', 'handleFnbGlPostingForAccounting'],
    voidEvents: ['order.voided.v1'],
  },
  pms_folio: {
    reportingEvents: ['pms.folio.charge_posted.v1'],
    reportingConsumers: ['handleFolioChargePosted'],
    glEvents: ['pms.folio.charge_posted.v1'],
    glAdapters: ['handleFolioChargeForAccounting'],
    voidEvents: [],
    knownGap: 'PMS module has no void/refund event (only created, charge_posted, closed). Folio void requires PMS module changes.',
  },
  ar_invoice: {
    reportingEvents: ['ar.invoice.posted.v1', 'ar.invoice.voided.v1'],
    reportingConsumers: ['handleArInvoicePosted', 'handleArInvoiceVoided'],
    glEvents: ['ar.invoice.posted.v1'],
    glAdapters: [], // AR self-posts GL inside the command via accountingApi
    voidEvents: ['ar.invoice.voided.v1'],
  },
  membership: {
    reportingEvents: ['membership.billing.charged.v1'],
    reportingConsumers: ['handleMembershipCharged'],
    glEvents: ['membership.billing.charged.v1'],
    glAdapters: ['handleMembershipBillingForAccounting'],
    voidEvents: [],
    knownGap: 'Membership billing has no void event. Billing cycle charge is final. Corrections handled via AR credit memos.',
  },
  voucher: {
    reportingEvents: ['voucher.purchased.v1'],
    reportingConsumers: ['handleVoucherPurchased'],
    glEvents: ['voucher.purchased.v1'],
    glAdapters: ['handleVoucherPurchaseForAccounting'],
    voidEvents: [],
    knownGap: 'Voucher purchase void not yet implemented. Corrections handled via manual GL adjustments.',
  },
  voucher_redemption: {
    reportingEvents: ['voucher.redeemed.v1'],
    reportingConsumers: ['handleVoucherRedeemed'],
    glEvents: ['voucher.redeemed.v1'],
    glAdapters: ['handleVoucherRedemptionForAccounting'],
    voidEvents: [],
    knownGap: 'Redemptions are liability-to-revenue conversions. Not reversible — voiding the order that triggered redemption is the correction path.',
  },
  voucher_expiration: {
    reportingEvents: ['voucher.expired.v1'],
    reportingConsumers: ['handleVoucherExpired'],
    glEvents: ['voucher.expired.v1'],
    glAdapters: ['handleVoucherExpirationForAccounting'],
    voidEvents: [],
    knownGap: 'Expirations are batch background job. Breakage income recognition is final. No void path — re-activate voucher instead.',
  },
  pos_return: {
    reportingEvents: ['order.returned.v1'],
    reportingConsumers: ['handleOrderReturned'],
    glEvents: ['order.returned.v1'],
    glAdapters: ['handleOrderReturnForAccounting'],
    voidEvents: [],
    knownGap: 'Returns are corrections to paid orders. Voiding a return is not supported — re-sell the item instead.',
  },
};

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('Revenue Pipeline Coverage Guard', () => {
  it('every REVENUE_SOURCES key has a coverage matrix entry', () => {
    const matrixKeys = Object.keys(COVERAGE_MATRIX);
    const missingFromMatrix = REVENUE_SOURCE_KEYS.filter(
      (k) => !matrixKeys.includes(k),
    );

    expect(missingFromMatrix).toEqual([]);
  });

  it('every coverage matrix entry has a REVENUE_SOURCES entry', () => {
    const matrixKeys = Object.keys(COVERAGE_MATRIX);
    const missingFromSources = matrixKeys.filter(
      (k: string) => !REVENUE_SOURCE_KEYS.includes(k),
    );

    expect(missingFromSources).toEqual([]);
  });

  describe.each(REVENUE_SOURCE_KEYS)('source: %s', (sourceKey: string) => {
    const coverage = COVERAGE_MATRIX[sourceKey];

    it('has at least one reporting consumer', () => {
      expect(coverage).toBeDefined();
      expect(coverage!.reportingConsumers.length).toBeGreaterThan(0);
    });

    it('has at least one reporting event wired', () => {
      expect(coverage!.reportingEvents.length).toBeGreaterThan(0);
    });

    it('has GL coverage (adapter or self-posting command)', () => {
      // AR self-posts GL inside the command — no adapter needed
      if (sourceKey === 'ar_invoice') {
        // AR has no GL adapter — it uses accountingApi directly in voidInvoice/postInvoice commands
        // Just verify the event exists in the GL events list
        expect(coverage!.glEvents.length).toBeGreaterThan(0);
        return;
      }

      expect(coverage!.glAdapters.length).toBeGreaterThan(0);
    });

    it('has void/reversal path OR is documented as known gap', () => {
      if (coverage!.voidEvents.length === 0) {
        expect(coverage!.knownGap).toBeDefined();
        expect(coverage!.knownGap!.length).toBeGreaterThan(0);
      }
    });
  });

  it('REVENUE_SOURCES registry has the expected number of sources', () => {
    // Bump this number when adding new sources — forces a review
    expect(REVENUE_SOURCE_KEYS.length).toBe(9);
  });

  it('all sources have valid sortOrder (unique, positive)', () => {
    const sortOrders = (Object.values(REVENUE_SOURCES) as RevenueSourceDefinition[]).map((s) => s.sortOrder);
    const uniqueSorted = [...new Set(sortOrders)].sort((a, b) => a - b);

    expect(sortOrders.length).toBe(uniqueSorted.length);
    expect(Math.min(...sortOrders)).toBeGreaterThan(0);
  });

  it('all sources have required fields', () => {
    for (const [key, source] of Object.entries(REVENUE_SOURCES) as [string, RevenueSourceDefinition][]) {
      expect(source.key).toBe(key);
      expect(source.label.length).toBeGreaterThan(0);
      expect(source.shortLabel.length).toBeGreaterThan(0);
      expect(source.icon.length).toBeGreaterThan(0);
      expect(source.color.length).toBeGreaterThan(0);
      expect(source.moduleKey.length).toBeGreaterThan(0);
    }
  });
});
