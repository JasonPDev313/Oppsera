import { describe, it, expect } from 'vitest';
import {
  createInvoiceSchema,
  postInvoiceSchema,
  voidInvoiceSchema,
  invoiceLineSchema,
  createReceiptSchema,
  postReceiptSchema,
  voidReceiptSchema,
  receiptAllocationSchema,
  INVOICE_STATUSES,
  RECEIPT_STATUSES,
  AR_SOURCE_TYPES,
  RECEIPT_SOURCE_TYPES,
  AR_PAYMENT_METHODS,
} from '../validation';
import {
  InvoiceStatusError,
  DuplicateInvoiceNumberError,
  ReceiptExceedsInvoiceError,
  ReceiptStatusError,
} from '../errors';

// ── Constants ─────────────────────────────────────────────────────────

describe('AR constants', () => {
  it('should define correct invoice statuses', () => {
    expect(INVOICE_STATUSES).toEqual(['draft', 'posted', 'partial', 'paid', 'voided']);
  });

  it('should define correct receipt statuses', () => {
    expect(RECEIPT_STATUSES).toEqual(['draft', 'posted', 'voided']);
  });

  it('should define correct AR source types', () => {
    expect(AR_SOURCE_TYPES).toContain('manual');
    expect(AR_SOURCE_TYPES).toContain('membership');
    expect(AR_SOURCE_TYPES).toContain('pos_house_account');
    expect(AR_SOURCE_TYPES).toHaveLength(4);
  });

  it('should define correct receipt source types', () => {
    expect(RECEIPT_SOURCE_TYPES).toContain('manual');
    expect(RECEIPT_SOURCE_TYPES).toContain('pos_tender');
    expect(RECEIPT_SOURCE_TYPES).toContain('online_payment');
    expect(RECEIPT_SOURCE_TYPES).toHaveLength(3);
  });

  it('should define correct AR payment methods', () => {
    expect(AR_PAYMENT_METHODS).toContain('cash');
    expect(AR_PAYMENT_METHODS).toContain('check');
    expect(AR_PAYMENT_METHODS).toContain('ach');
    expect(AR_PAYMENT_METHODS).toContain('wire');
    expect(AR_PAYMENT_METHODS).toContain('credit_card');
    expect(AR_PAYMENT_METHODS).toContain('other');
    expect(AR_PAYMENT_METHODS).toHaveLength(6);
  });
});

// ── Invoice Line Schema ──────────────────────────────────────────────

describe('invoiceLineSchema', () => {
  it('should accept valid line with all fields', () => {
    const result = invoiceLineSchema.safeParse({
      accountId: 'acct-1',
      description: 'Service fee',
      quantity: '2',
      unitPrice: '50.00',
      amount: '100.00',
      taxGroupId: 'tax-1',
      taxAmount: '8.00',
      sortOrder: 0,
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid line with only required fields', () => {
    const result = invoiceLineSchema.safeParse({
      accountId: 'acct-1',
      description: 'Line item',
      amount: '250.00',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe('1');
      expect(result.data.unitPrice).toBe('0');
      expect(result.data.taxAmount).toBe('0');
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it('should reject empty accountId', () => {
    const result = invoiceLineSchema.safeParse({
      accountId: '',
      description: 'Test',
      amount: '100.00',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty description', () => {
    const result = invoiceLineSchema.safeParse({
      accountId: 'acct-1',
      description: '',
      amount: '100.00',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid amount format', () => {
    const result = invoiceLineSchema.safeParse({
      accountId: 'acct-1',
      description: 'Test',
      amount: 'not-a-number',
    });
    expect(result.success).toBe(false);
  });

  it('should accept negative amount', () => {
    const result = invoiceLineSchema.safeParse({
      accountId: 'acct-1',
      description: 'Credit',
      amount: '-50.00',
    });
    expect(result.success).toBe(true);
  });

  it('should reject amount with more than 2 decimals', () => {
    const result = invoiceLineSchema.safeParse({
      accountId: 'acct-1',
      description: 'Test',
      amount: '100.001',
    });
    expect(result.success).toBe(false);
  });
});

// ── Create Invoice Schema ────────────────────────────────────────────

describe('createInvoiceSchema', () => {
  const validInput = {
    customerId: 'cust-1',
    invoiceNumber: 'INV-001',
    invoiceDate: '2026-02-15',
    dueDate: '2026-03-15',
    lines: [{ accountId: 'acct-1', description: 'Service', amount: '500.00' }],
  };

  it('should accept valid input with minimal fields', () => {
    const result = createInvoiceSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceType).toBe('manual'); // default
    }
  });

  it('should accept valid input with all optional fields', () => {
    const result = createInvoiceSchema.safeParse({
      ...validInput,
      billingAccountId: 'ba-1',
      memo: 'Monthly invoice',
      locationId: 'loc-1',
      sourceType: 'membership',
      sourceReferenceId: 'ref-123',
      clientRequestId: 'cr-1',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty customerId', () => {
    const result = createInvoiceSchema.safeParse({ ...validInput, customerId: '' });
    expect(result.success).toBe(false);
  });

  it('should reject empty invoiceNumber', () => {
    const result = createInvoiceSchema.safeParse({ ...validInput, invoiceNumber: '' });
    expect(result.success).toBe(false);
  });

  it('should reject invoiceNumber longer than 50 chars', () => {
    const result = createInvoiceSchema.safeParse({
      ...validInput,
      invoiceNumber: 'A'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid date format', () => {
    const result = createInvoiceSchema.safeParse({
      ...validInput,
      invoiceDate: '02/15/2026',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty lines array', () => {
    const result = createInvoiceSchema.safeParse({ ...validInput, lines: [] });
    expect(result.success).toBe(false);
  });

  it('should reject invalid sourceType', () => {
    const result = createInvoiceSchema.safeParse({
      ...validInput,
      sourceType: 'invalid_source',
    });
    expect(result.success).toBe(false);
  });

  it('should reject memo longer than 1000 chars', () => {
    const result = createInvoiceSchema.safeParse({
      ...validInput,
      memo: 'X'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

// ── Post Invoice Schema ──────────────────────────────────────────────

describe('postInvoiceSchema', () => {
  it('should accept valid invoiceId', () => {
    const result = postInvoiceSchema.safeParse({ invoiceId: 'inv-1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.forcePost).toBe(false); // default
    }
  });

  it('should reject empty invoiceId', () => {
    const result = postInvoiceSchema.safeParse({ invoiceId: '' });
    expect(result.success).toBe(false);
  });

  it('should accept optional businessDate', () => {
    const result = postInvoiceSchema.safeParse({
      invoiceId: 'inv-1',
      businessDate: '2026-02-15',
    });
    expect(result.success).toBe(true);
  });

  it('should accept forcePost flag', () => {
    const result = postInvoiceSchema.safeParse({ invoiceId: 'inv-1', forcePost: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.forcePost).toBe(true);
    }
  });
});

// ── Void Invoice Schema ──────────────────────────────────────────────

describe('voidInvoiceSchema', () => {
  it('should accept valid input', () => {
    const result = voidInvoiceSchema.safeParse({
      invoiceId: 'inv-1',
      reason: 'Customer dispute',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty reason', () => {
    const result = voidInvoiceSchema.safeParse({ invoiceId: 'inv-1', reason: '' });
    expect(result.success).toBe(false);
  });

  it('should reject reason longer than 500 chars', () => {
    const result = voidInvoiceSchema.safeParse({
      invoiceId: 'inv-1',
      reason: 'R'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ── Receipt Allocation Schema ────────────────────────────────────────

describe('receiptAllocationSchema', () => {
  it('should accept valid allocation', () => {
    const result = receiptAllocationSchema.safeParse({
      invoiceId: 'inv-1',
      amount: '100.00',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty invoiceId', () => {
    const result = receiptAllocationSchema.safeParse({ invoiceId: '', amount: '100.00' });
    expect(result.success).toBe(false);
  });

  it('should reject negative amount', () => {
    const result = receiptAllocationSchema.safeParse({
      invoiceId: 'inv-1',
      amount: '-50.00',
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-numeric amount', () => {
    const result = receiptAllocationSchema.safeParse({
      invoiceId: 'inv-1',
      amount: 'abc',
    });
    expect(result.success).toBe(false);
  });
});

// ── Create Receipt Schema ────────────────────────────────────────────

describe('createReceiptSchema', () => {
  const validInput = {
    customerId: 'cust-1',
    receiptDate: '2026-02-20',
    amount: '300.00',
    allocations: [{ invoiceId: 'inv-1', amount: '300.00' }],
  };

  it('should accept valid input with minimal fields', () => {
    const result = createReceiptSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceType).toBe('manual');
    }
  });

  it('should accept valid input with all fields', () => {
    const result = createReceiptSchema.safeParse({
      ...validInput,
      paymentMethod: 'check',
      referenceNumber: 'CHK-001',
      bankAccountId: 'bank-1',
      sourceType: 'pos_tender',
      sourceReferenceId: 'ref-1',
      clientRequestId: 'cr-1',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty allocations', () => {
    const result = createReceiptSchema.safeParse({ ...validInput, allocations: [] });
    expect(result.success).toBe(false);
  });

  it('should reject invalid payment method', () => {
    const result = createReceiptSchema.safeParse({
      ...validInput,
      paymentMethod: 'bitcoin',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid date format', () => {
    const result = createReceiptSchema.safeParse({
      ...validInput,
      receiptDate: '20-02-2026',
    });
    expect(result.success).toBe(false);
  });
});

// ── Post Receipt Schema ──────────────────────────────────────────────

describe('postReceiptSchema', () => {
  it('should accept valid receiptId', () => {
    const result = postReceiptSchema.safeParse({ receiptId: 'rcp-1' });
    expect(result.success).toBe(true);
  });

  it('should reject empty receiptId', () => {
    const result = postReceiptSchema.safeParse({ receiptId: '' });
    expect(result.success).toBe(false);
  });
});

// ── Void Receipt Schema ──────────────────────────────────────────────

describe('voidReceiptSchema', () => {
  it('should accept valid input', () => {
    const result = voidReceiptSchema.safeParse({
      receiptId: 'rcp-1',
      reason: 'Bounced check',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty reason', () => {
    const result = voidReceiptSchema.safeParse({ receiptId: 'rcp-1', reason: '' });
    expect(result.success).toBe(false);
  });

  it('should reject reason longer than 500 chars', () => {
    const result = voidReceiptSchema.safeParse({
      receiptId: 'rcp-1',
      reason: 'X'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ── Error classes ────────────────────────────────────────────────────

describe('Error classes', () => {
  it('InvoiceStatusError should have status 409', () => {
    const err = new InvoiceStatusError('inv-1', 'posted', 'draft');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('INVOICE_STATUS_ERROR');
    expect(err.message).toContain('inv-1');
    expect(err.message).toContain('posted');
    expect(err.message).toContain('draft');
  });

  it('ReceiptStatusError should have status 409', () => {
    const err = new ReceiptStatusError('rcp-1', 'draft', 'posted');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('RECEIPT_STATUS_ERROR');
    expect(err.message).toContain('rcp-1');
    expect(err.message).toContain('draft');
    expect(err.message).toContain('posted');
  });

  it('DuplicateInvoiceNumberError should have status 409', () => {
    const err = new DuplicateInvoiceNumberError('INV-001');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('DUPLICATE_INVOICE_NUMBER');
    expect(err.message).toContain('INV-001');
  });

  it('ReceiptExceedsInvoiceError should have status 400', () => {
    const err = new ReceiptExceedsInvoiceError('inv-1');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('RECEIPT_EXCEEDS_INVOICE');
    expect(err.message).toContain('inv-1');
  });

  it('All error classes should be instances of Error', () => {
    expect(new InvoiceStatusError('x', 'a', 'b')).toBeInstanceOf(Error);
    expect(new ReceiptStatusError('x', 'a', 'b')).toBeInstanceOf(Error);
    expect(new DuplicateInvoiceNumberError('x')).toBeInstanceOf(Error);
    expect(new ReceiptExceedsInvoiceError('x')).toBeInstanceOf(Error);
  });
});
