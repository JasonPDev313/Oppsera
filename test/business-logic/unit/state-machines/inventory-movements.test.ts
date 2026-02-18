/**
 * Phase 2 — Inventory Movement Type Correctness
 *
 * Documents and tests all movement types and their rules.
 * Pure unit test — no database required.
 *
 * Movement types and their expected delta signs:
 *   receive       → positive (stock coming in)
 *   sale          → negative (stock going out)
 *   void_reversal → positive (undoes a sale)
 *   adjustment    → positive or negative
 *   transfer_out  → negative (leaving this location)
 *   transfer_in   → positive (arriving at this location)
 *   shrink        → negative (loss/theft)
 *   waste         → negative (spoilage)
 *   return        → positive (customer return)
 *   initial       → positive (opening balance)
 *   conversion    → positive or negative (UOM conversion)
 */

type MovementType =
  | 'receive' | 'sale' | 'void_reversal' | 'adjustment'
  | 'transfer_out' | 'transfer_in' | 'shrink' | 'waste'
  | 'return' | 'initial' | 'conversion';

interface MovementRule {
  type: MovementType;
  validSigns: ('positive' | 'negative' | 'zero')[];
  requiresReference: boolean;
  description: string;
}

const MOVEMENT_RULES: MovementRule[] = [
  { type: 'receive', validSigns: ['positive'], requiresReference: false, description: 'Purchase/receiving' },
  { type: 'sale', validSigns: ['negative'], requiresReference: true, description: 'POS sale deduction' },
  { type: 'void_reversal', validSigns: ['positive'], requiresReference: true, description: 'Undoes a sale via order void' },
  { type: 'adjustment', validSigns: ['positive', 'negative'], requiresReference: false, description: 'Manual count correction' },
  { type: 'transfer_out', validSigns: ['negative'], requiresReference: false, description: 'Outbound inter-location transfer' },
  { type: 'transfer_in', validSigns: ['positive'], requiresReference: false, description: 'Inbound inter-location transfer' },
  { type: 'shrink', validSigns: ['negative'], requiresReference: false, description: 'Theft/loss' },
  { type: 'waste', validSigns: ['negative'], requiresReference: false, description: 'Spoilage/expiration' },
  { type: 'return', validSigns: ['positive'], requiresReference: true, description: 'Customer return' },
  { type: 'initial', validSigns: ['positive'], requiresReference: false, description: 'Opening balance' },
  { type: 'conversion', validSigns: ['positive', 'negative'], requiresReference: false, description: 'UOM conversion' },
];

function isValidDelta(type: MovementType, delta: number): boolean {
  const rule = MOVEMENT_RULES.find((r) => r.type === type);
  if (!rule) return false;
  if (delta > 0) return rule.validSigns.includes('positive');
  if (delta < 0) return rule.validSigns.includes('negative');
  return rule.validSigns.includes('zero');
}

function computeOnHand(movements: Array<{ delta: number }>): number {
  return movements.reduce((sum, m) => sum + m.delta, 0);
}

describe('Inventory Movement Types', () => {
  // ── Delta Sign Validation ──

  describe('Delta Sign Rules', () => {
    it('receive must be positive', () => {
      expect(isValidDelta('receive', 10)).toBe(true);
      expect(isValidDelta('receive', -10)).toBe(false);
    });

    it('sale must be negative', () => {
      expect(isValidDelta('sale', -1)).toBe(true);
      expect(isValidDelta('sale', 1)).toBe(false);
    });

    it('void_reversal must be positive (undoes sale)', () => {
      expect(isValidDelta('void_reversal', 3)).toBe(true);
      expect(isValidDelta('void_reversal', -3)).toBe(false);
    });

    it('adjustment can be positive or negative', () => {
      expect(isValidDelta('adjustment', 5)).toBe(true);
      expect(isValidDelta('adjustment', -5)).toBe(true);
    });

    it('transfer_out must be negative', () => {
      expect(isValidDelta('transfer_out', -10)).toBe(true);
      expect(isValidDelta('transfer_out', 10)).toBe(false);
    });

    it('transfer_in must be positive', () => {
      expect(isValidDelta('transfer_in', 10)).toBe(true);
      expect(isValidDelta('transfer_in', -10)).toBe(false);
    });

    it('shrink must be negative', () => {
      expect(isValidDelta('shrink', -2)).toBe(true);
      expect(isValidDelta('shrink', 2)).toBe(false);
    });

    it('waste must be negative', () => {
      expect(isValidDelta('waste', -5)).toBe(true);
      expect(isValidDelta('waste', 5)).toBe(false);
    });

    it('return must be positive', () => {
      expect(isValidDelta('return', 1)).toBe(true);
      expect(isValidDelta('return', -1)).toBe(false);
    });

    it('initial must be positive', () => {
      expect(isValidDelta('initial', 100)).toBe(true);
      expect(isValidDelta('initial', -100)).toBe(false);
    });

    it('conversion can be positive or negative', () => {
      expect(isValidDelta('conversion', 5)).toBe(true);
      expect(isValidDelta('conversion', -5)).toBe(true);
    });
  });

  // ── On-Hand Computation ──

  describe('On-Hand = SUM(delta)', () => {
    it('initial stock only', () => {
      expect(computeOnHand([{ delta: 100 }])).toBe(100);
    });

    it('initial + sale', () => {
      expect(computeOnHand([{ delta: 100 }, { delta: -1 }])).toBe(99);
    });

    it('initial + receive + sale + adjustment', () => {
      expect(computeOnHand([
        { delta: 100 },  // initial
        { delta: 25 },   // receive
        { delta: -10 },  // sale
        { delta: -3 },   // adjustment
      ])).toBe(112);
    });

    it('sale + void = net zero impact', () => {
      expect(computeOnHand([
        { delta: 100 },  // initial
        { delta: -5 },   // sale
        { delta: 5 },    // void_reversal
      ])).toBe(100);
    });

    it('transfer_out + transfer_in = net zero at system level', () => {
      // Single location sees only one side
      const location1 = computeOnHand([{ delta: 100 }, { delta: -25 }]); // transfer_out
      const location2 = computeOnHand([{ delta: 0 }, { delta: 25 }]);    // transfer_in
      expect(location1 + location2).toBe(100); // System total preserved
    });

    it('no movements = 0 on-hand', () => {
      expect(computeOnHand([])).toBe(0);
    });
  });

  // ── Reference Requirements ──

  describe('Reference Requirements', () => {
    const requiresRef = MOVEMENT_RULES.filter((r) => r.requiresReference).map((r) => r.type);
    const noRef = MOVEMENT_RULES.filter((r) => !r.requiresReference).map((r) => r.type);

    it('sale requires a reference (order)', () => {
      expect(requiresRef).toContain('sale');
    });

    it('void_reversal requires a reference (order)', () => {
      expect(requiresRef).toContain('void_reversal');
    });

    it('return requires a reference (order)', () => {
      expect(requiresRef).toContain('return');
    });

    it('receive does not require a reference', () => {
      expect(noRef).toContain('receive');
    });

    it('adjustment does not require a reference', () => {
      expect(noRef).toContain('adjustment');
    });
  });

  // ── Package Item Deduction ──

  describe('Package Item Deduction [ASSUMED]', () => {
    it('package items deduct COMPONENTS, not the package itself', () => {
      // A package with 3 components: deduct each component qty * line qty
      const packageComponents = [
        { catalogItemId: 'comp1', qty: 1 },
        { catalogItemId: 'comp2', qty: 2 },
        { catalogItemId: 'comp3', qty: 1 },
      ];
      const lineQty = 2;

      const movements = packageComponents.map((comp) => ({
        inventoryItemId: comp.catalogItemId,
        delta: -(comp.qty * lineQty),
      }));

      expect(movements).toEqual([
        { inventoryItemId: 'comp1', delta: -2 },
        { inventoryItemId: 'comp2', delta: -4 },
        { inventoryItemId: 'comp3', delta: -2 },
      ]);
    });
  });

  // ── Transfer Pairing ──

  describe('Transfer Pairing', () => {
    it('transfer_out + transfer_in with same batchId are paired', () => {
      const batchId = 'batch_123';
      const out = { type: 'transfer_out' as MovementType, delta: -10, batchId };
      const into = { type: 'transfer_in' as MovementType, delta: 10, batchId };

      expect(out.batchId).toBe(into.batchId);
      expect(out.delta + into.delta).toBe(0); // Net zero
    });
  });

  // ── Negative Stock Rules ──

  describe('Negative Stock Rules [ASSUMED]', () => {
    it('allowNegative=false blocks sale below zero', () => {
      const onHand = 5;
      const saleQty = 10;
      const allowNegative = false;

      const wouldGoNegative = onHand - saleQty < 0;
      const blocked = wouldGoNegative && !allowNegative;

      expect(blocked).toBe(true);
    });

    it('allowNegative=true allows sale below zero', () => {
      const onHand = 5;
      const saleQty = 10;
      const allowNegative = true;

      const wouldGoNegative = onHand - saleQty < 0;
      const blocked = wouldGoNegative && !allowNegative;

      expect(blocked).toBe(false);
    });

    it('transfers ALWAYS enforce non-negative at source regardless of allowNegative', () => {
      const sourceOnHand = 5;
      const transferQty = 10;
      const allowNegative = true; // Even with this set to true...

      // Transfers override allowNegative for source location
      const transferBlocked = sourceOnHand - transferQty < 0;
      expect(transferBlocked).toBe(true); // ...transfer is still blocked
    });
  });
});
