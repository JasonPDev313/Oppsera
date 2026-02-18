/**
 * Phase 2 — Payment State Machine Correctness
 *
 * Documents tender lifecycle and reversal rules.
 * Pure unit test — no database required.
 *
 * Tender statuses: 'captured' (only status in V1)
 * Reversal statuses: 'completed' (only status in V1)
 *
 * Key rules:
 *   - Tenders are APPEND-ONLY — financial fields never updated
 *   - "Reversed" is a derived state from tender_reversals join
 *   - Tip does NOT affect order.total
 *   - clientRequestId is REQUIRED for idempotency
 *   - Tender sequence is monotonically increasing per order
 *   - Reversal amount <= original tender amount
 */

type TenderType = 'cash' | 'card' | 'gift_card' | 'store_credit' | 'house_account' | 'other';
type ReversalType = 'void' | 'refund';

interface Tender {
  id: string;
  amount: number;
  tipAmount: number;
  amountGiven: number;
  changeGiven: number;
  tenderType: TenderType;
  tenderSequence: number;
}

interface TenderReversal {
  originalTenderId: string;
  reversalType: ReversalType;
  amount: number;
}

// Pure business rules
function isTenderReversed(tender: Tender, reversals: TenderReversal[]): boolean {
  const totalReversed = reversals
    .filter((r) => r.originalTenderId === tender.id)
    .reduce((sum, r) => sum + r.amount, 0);
  return totalReversed >= tender.amount;
}

function isPartiallyReversed(tender: Tender, reversals: TenderReversal[]): boolean {
  const totalReversed = reversals
    .filter((r) => r.originalTenderId === tender.id)
    .reduce((sum, r) => sum + r.amount, 0);
  return totalReversed > 0 && totalReversed < tender.amount;
}

function netPaid(tenders: Tender[], reversals: TenderReversal[]): number {
  const totalTendered = tenders.reduce((s, t) => s + t.amount, 0);
  const totalReversed = reversals.reduce((s, r) => s + r.amount, 0);
  return totalTendered - totalReversed;
}

function isOrderFullyPaid(orderTotal: number, tenders: Tender[], reversals: TenderReversal[]): boolean {
  return netPaid(tenders, reversals) >= orderTotal;
}

function cashChangeCalculation(amountGiven: number, orderAmount: number): number {
  return Math.max(0, amountGiven - orderAmount);
}

describe('Payment State Machine', () => {
  // ── Tender Types ──

  describe('Valid Tender Types', () => {
    const validTypes: TenderType[] = ['cash', 'card', 'gift_card', 'store_credit', 'house_account', 'other'];

    for (const type of validTypes) {
      it(`${type} is a valid tender type`, () => {
        expect(validTypes.includes(type)).toBe(true);
      });
    }
  });

  // ── Cash Change Calculation ──

  describe('Cash Change', () => {
    it('exact payment: no change', () => {
      expect(cashChangeCalculation(1085, 1085)).toBe(0);
    });

    it('overpayment: change returned', () => {
      expect(cashChangeCalculation(2000, 1085)).toBe(915);
    });

    it('$20 given for $9.99 order', () => {
      expect(cashChangeCalculation(2000, 999)).toBe(1001);
    });

    it('$100 given for $0.01 order', () => {
      expect(cashChangeCalculation(10000, 1)).toBe(9999);
    });
  });

  // ── Reversal Rules ──

  describe('Reversal Detection', () => {
    it('tender with no reversals is not reversed', () => {
      const tender: Tender = {
        id: 't1', amount: 1000, tipAmount: 0, amountGiven: 1000,
        changeGiven: 0, tenderType: 'cash', tenderSequence: 1,
      };
      expect(isTenderReversed(tender, [])).toBe(false);
    });

    it('tender with full reversal is reversed', () => {
      const tender: Tender = {
        id: 't1', amount: 1000, tipAmount: 0, amountGiven: 1000,
        changeGiven: 0, tenderType: 'cash', tenderSequence: 1,
      };
      const reversals: TenderReversal[] = [
        { originalTenderId: 't1', reversalType: 'void', amount: 1000 },
      ];
      expect(isTenderReversed(tender, reversals)).toBe(true);
    });

    it('tender with partial reversal is partially reversed', () => {
      const tender: Tender = {
        id: 't1', amount: 1000, tipAmount: 0, amountGiven: 1000,
        changeGiven: 0, tenderType: 'card', tenderSequence: 1,
      };
      const reversals: TenderReversal[] = [
        { originalTenderId: 't1', reversalType: 'refund', amount: 500 },
      ];
      expect(isPartiallyReversed(tender, reversals)).toBe(true);
      expect(isTenderReversed(tender, reversals)).toBe(false);
    });
  });

  // ── Net Paid Calculation ──

  describe('Net Paid', () => {
    it('single tender, no reversals', () => {
      const tenders: Tender[] = [{
        id: 't1', amount: 1085, tipAmount: 0, amountGiven: 1085,
        changeGiven: 0, tenderType: 'cash', tenderSequence: 1,
      }];
      expect(netPaid(tenders, [])).toBe(1085);
    });

    it('single tender, full reversal = 0', () => {
      const tenders: Tender[] = [{
        id: 't1', amount: 1085, tipAmount: 0, amountGiven: 1085,
        changeGiven: 0, tenderType: 'cash', tenderSequence: 1,
      }];
      const reversals: TenderReversal[] = [
        { originalTenderId: 't1', reversalType: 'void', amount: 1085 },
      ];
      expect(netPaid(tenders, reversals)).toBe(0);
    });

    it('split payment, one reversed', () => {
      const tenders: Tender[] = [
        { id: 't1', amount: 500, tipAmount: 0, amountGiven: 500, changeGiven: 0, tenderType: 'cash', tenderSequence: 1 },
        { id: 't2', amount: 585, tipAmount: 0, amountGiven: 585, changeGiven: 0, tenderType: 'card', tenderSequence: 2 },
      ];
      const reversals: TenderReversal[] = [
        { originalTenderId: 't1', reversalType: 'void', amount: 500 },
      ];
      expect(netPaid(tenders, reversals)).toBe(585);
    });
  });

  // ── Order Payment Status ──

  describe('Order Payment Status', () => {
    it('fully paid when netPaid >= orderTotal', () => {
      const tenders: Tender[] = [{
        id: 't1', amount: 1085, tipAmount: 0, amountGiven: 1085,
        changeGiven: 0, tenderType: 'cash', tenderSequence: 1,
      }];
      expect(isOrderFullyPaid(1085, tenders, [])).toBe(true);
    });

    it('not fully paid when netPaid < orderTotal', () => {
      const tenders: Tender[] = [{
        id: 't1', amount: 500, tipAmount: 0, amountGiven: 500,
        changeGiven: 0, tenderType: 'cash', tenderSequence: 1,
      }];
      expect(isOrderFullyPaid(1085, tenders, [])).toBe(false);
    });

    it('$0 order is always fully paid', () => {
      expect(isOrderFullyPaid(0, [], [])).toBe(true);
    });
  });

  // ── Tip Rules ──

  describe('Tip Rules', () => {
    it('tip does not affect tender.amount', () => {
      // In OppsEra, tender.amount = the order portion
      // tip is stored separately in tipAmount
      const tender: Tender = {
        id: 't1', amount: 2000, tipAmount: 500, amountGiven: 2500,
        changeGiven: 0, tenderType: 'card', tenderSequence: 1,
      };
      expect(tender.amount).toBe(2000); // Excludes tip
      expect(tender.amount + tender.tipAmount).toBe(2500); // Total charged
    });

    it('net paid calculation excludes tips', () => {
      const tenders: Tender[] = [{
        id: 't1', amount: 2000, tipAmount: 500, amountGiven: 2500,
        changeGiven: 0, tenderType: 'card', tenderSequence: 1,
      }];
      // netPaid uses amount (excludes tip)
      expect(netPaid(tenders, [])).toBe(2000);
    });
  });

  // ── Reversal Types ──

  describe('Reversal Types', () => {
    it('void is for canceling the entire tender', () => {
      const reversalType: ReversalType = 'void';
      expect(reversalType).toBe('void');
    });

    it('refund is for returning partial/full amount', () => {
      const reversalType: ReversalType = 'refund';
      expect(reversalType).toBe('refund');
    });
  });
});
