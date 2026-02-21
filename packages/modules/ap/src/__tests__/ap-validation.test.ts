import { describe, it, expect } from 'vitest';
import {
  createBillSchema,
  billLineSchema,
  createPaymentSchema,
  paymentAllocationSchema,
  createPaymentTermsSchema,
  updateVendorAccountingSchema,
} from '../validation';

describe('AP Validation Schemas', () => {
  describe('createBillSchema', () => {
    it('should accept valid input', () => {
      const input = {
        vendorId: 'vendor-1',
        billNumber: 'BILL-001',
        billDate: '2026-01-15',
        dueDate: '2026-02-15',
        lines: [
          {
            description: 'Office supplies',
            lineType: 'expense',
            glAccountId: 'acct-1',
            amount: '500.00',
          },
        ],
      };

      const result = createBillSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.vendorId).toBe('vendor-1');
        expect(result.data.billNumber).toBe('BILL-001');
        expect(result.data.lines).toHaveLength(1);
      }
    });

    it('should reject missing required fields', () => {
      const input = {
        vendorId: 'vendor-1',
        // missing billNumber, billDate, dueDate, lines
      };

      const result = createBillSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('billNumber');
        expect(paths).toContain('billDate');
        expect(paths).toContain('dueDate');
        expect(paths).toContain('lines');
      }
    });

    it('should reject empty lines array', () => {
      const input = {
        vendorId: 'vendor-1',
        billNumber: 'BILL-001',
        billDate: '2026-01-15',
        dueDate: '2026-02-15',
        lines: [],
      };

      const result = createBillSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept optional fields', () => {
      const input = {
        vendorId: 'vendor-1',
        billNumber: 'BILL-002',
        billDate: '2026-01-15',
        dueDate: '2026-02-15',
        paymentTermsId: 'pt-1',
        locationId: 'loc-1',
        memo: 'Monthly office supplies',
        vendorInvoiceNumber: 'INV-2026-001',
        clientRequestId: 'req-abc',
        lines: [
          {
            description: 'Paper',
            lineType: 'item',
            glAccountId: 'acct-1',
            amount: '50.00',
            quantity: '10',
            unitCost: '5.00',
            locationId: 'loc-1',
            departmentId: 'dept-1',
            inventoryItemId: 'inv-item-1',
            memo: 'A4 paper packs',
          },
        ],
      };

      const result = createBillSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const input = {
        vendorId: 'vendor-1',
        billNumber: 'BILL-001',
        billDate: '2026/01/15', // wrong format
        dueDate: '2026-02-15',
        lines: [
          { description: 'Item', lineType: 'expense', glAccountId: 'acct-1', amount: '100.00' },
        ],
      };

      const result = createBillSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('billLineSchema', () => {
    it('should validate lineType enum', () => {
      const validTypes = ['item', 'expense', 'freight', 'tax', 'other'];
      for (const lineType of validTypes) {
        const result = billLineSchema.safeParse({
          description: 'Test',
          lineType,
          glAccountId: 'acct-1',
          amount: '100.00',
        });
        expect(result.success).toBe(true);
      }

      // Invalid type
      const invalid = billLineSchema.safeParse({
        description: 'Test',
        lineType: 'invalid_type',
        glAccountId: 'acct-1',
        amount: '100.00',
      });
      expect(invalid.success).toBe(false);
    });

    it('should default quantity to 1', () => {
      const result = billLineSchema.parse({
        description: 'Test item',
        lineType: 'expense',
        glAccountId: 'acct-1',
        amount: '100.00',
      });
      expect(result.quantity).toBe('1');
    });

    it('should reject invalid amount format', () => {
      const result = billLineSchema.safeParse({
        description: 'Test',
        lineType: 'expense',
        glAccountId: 'acct-1',
        amount: 'not-a-number',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createPaymentSchema', () => {
    it('should accept valid payment input', () => {
      const input = {
        vendorId: 'vendor-1',
        paymentDate: '2026-02-20',
        paymentMethod: 'check',
        amount: '500.00',
        referenceNumber: 'CHK-1234',
        memo: 'Payment for BILL-001',
        allocations: [
          { billId: 'bill-1', amount: '500.00' },
        ],
      };

      const result = createPaymentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.paymentMethod).toBe('check');
        expect(result.data.allocations).toHaveLength(1);
      }
    });

    it('should reject invalid payment method', () => {
      const input = {
        vendorId: 'vendor-1',
        paymentDate: '2026-02-20',
        paymentMethod: 'bitcoin', // not valid
        amount: '500.00',
        allocations: [
          { billId: 'bill-1', amount: '500.00' },
        ],
      };

      const result = createPaymentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should require at least one allocation', () => {
      const input = {
        vendorId: 'vendor-1',
        paymentDate: '2026-02-20',
        paymentMethod: 'ach',
        amount: '500.00',
        allocations: [],
      };

      const result = createPaymentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('paymentAllocationSchema', () => {
    it('should validate positive amount', () => {
      const valid = paymentAllocationSchema.safeParse({
        billId: 'bill-1',
        amount: '250.00',
      });
      expect(valid.success).toBe(true);

      // Negative amount should fail
      const invalid = paymentAllocationSchema.safeParse({
        billId: 'bill-1',
        amount: '-100.00',
      });
      expect(invalid.success).toBe(false);
    });

    it('should require billId', () => {
      const result = paymentAllocationSchema.safeParse({
        amount: '100.00',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createPaymentTermsSchema', () => {
    it('should accept valid payment terms', () => {
      const input = {
        name: 'Net 30',
        code: 'NET30',
        termType: 'net',
        netDays: 30,
        discountDays: 10,
        discountPercent: '2.00',
        description: 'Pay within 30 days, 2% discount if paid within 10 days',
      };

      const result = createPaymentTermsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.termType).toBe('net');
        expect(result.data.isActive).toBe(true); // default
      }
    });

    it('should validate term type enum', () => {
      const validTypes = ['net', 'due_on_receipt', 'eom', 'custom'];
      for (const termType of validTypes) {
        const result = createPaymentTermsSchema.safeParse({
          name: `Type ${termType}`,
          code: termType.toUpperCase(),
          termType,
        });
        expect(result.success).toBe(true);
      }

      const invalid = createPaymentTermsSchema.safeParse({
        name: 'Bad',
        code: 'BAD',
        termType: 'invalid',
      });
      expect(invalid.success).toBe(false);
    });

    it('should reject netDays > 365', () => {
      const result = createPaymentTermsSchema.safeParse({
        name: 'Long Term',
        code: 'LONG',
        termType: 'net',
        netDays: 400,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateVendorAccountingSchema', () => {
    it('should accept valid vendor accounting update', () => {
      const input = {
        vendorNumber: 'V-001',
        defaultExpenseAccountId: 'acct-expense',
        defaultAPAccountId: 'acct-ap',
        paymentTermsId: 'pt-net30',
        is1099Eligible: true,
      };

      const result = updateVendorAccountingSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept nullable fields', () => {
      const input = {
        vendorNumber: null,
        defaultExpenseAccountId: null,
        defaultAPAccountId: null,
        paymentTermsId: null,
      };

      const result = updateVendorAccountingSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept partial updates', () => {
      // Only update one field
      const result = updateVendorAccountingSchema.safeParse({
        is1099Eligible: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject vendorNumber > 50 chars', () => {
      const result = updateVendorAccountingSchema.safeParse({
        vendorNumber: 'A'.repeat(51),
      });
      expect(result.success).toBe(false);
    });
  });
});
