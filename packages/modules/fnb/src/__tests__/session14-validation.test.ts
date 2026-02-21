import { describe, it, expect } from 'vitest';
import {
  PRINT_JOB_TYPES,
  PRINT_JOB_STATUSES,
  RECEIPT_COPY_TYPES,
  createRoutingRuleS14Schema,
  updateRoutingRuleS14Schema,
  deleteRoutingRuleS14Schema,
  createPrintJobSchema,
  reprintJobSchema,
  updatePrintJobStatusSchema,
  listPrintJobsSchema,
  getPrintJobSchema,
  listRoutingRulesS14Schema,
  renderGuestCheckSchema,
  renderReceiptSchema,
  renderKitchenChitSchema,
  renderDeltaChitSchema,
  renderExpoChitSchema,
  renderZReportSchema,
} from '../validation';

describe('Session 14 Enums', () => {
  it('PRINT_JOB_TYPES has 8 entries', () => {
    expect(PRINT_JOB_TYPES).toHaveLength(8);
    expect(PRINT_JOB_TYPES).toContain('guest_check');
    expect(PRINT_JOB_TYPES).toContain('kitchen_chit');
    expect(PRINT_JOB_TYPES).toContain('receipt');
    expect(PRINT_JOB_TYPES).toContain('close_batch_report');
  });

  it('PRINT_JOB_STATUSES has 5 entries', () => {
    expect(PRINT_JOB_STATUSES).toHaveLength(5);
  });

  it('RECEIPT_COPY_TYPES has 2 entries', () => {
    expect(RECEIPT_COPY_TYPES).toEqual(['merchant', 'customer']);
  });
});

describe('createRoutingRuleS14Schema', () => {
  it('validates valid input', () => {
    const result = createRoutingRuleS14Schema.safeParse({
      locationId: 'loc_01',
      printerId: 'printer_01',
      printJobType: 'kitchen_chit',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe(0); // default
    }
  });

  it('accepts stationId and priority', () => {
    const result = createRoutingRuleS14Schema.safeParse({
      locationId: 'loc_01',
      stationId: 'stn_01',
      printerId: 'printer_01',
      printJobType: 'bar_chit',
      priority: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid print job type', () => {
    const result = createRoutingRuleS14Schema.safeParse({
      locationId: 'loc_01',
      printerId: 'printer_01',
      printJobType: 'invalid_type',
    });
    expect(result.success).toBe(false);
  });

  it('rejects priority above 100', () => {
    const result = createRoutingRuleS14Schema.safeParse({
      locationId: 'loc_01',
      printerId: 'printer_01',
      printJobType: 'receipt',
      priority: 200,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateRoutingRuleS14Schema', () => {
  it('validates with just ruleId', () => {
    const result = updateRoutingRuleS14Schema.safeParse({ ruleId: 'rule_01' });
    expect(result.success).toBe(true);
  });

  it('accepts partial updates', () => {
    const result = updateRoutingRuleS14Schema.safeParse({
      ruleId: 'rule_01',
      isActive: false,
    });
    expect(result.success).toBe(true);
  });
});

describe('deleteRoutingRuleS14Schema', () => {
  it('validates', () => {
    const result = deleteRoutingRuleS14Schema.safeParse({ ruleId: 'rule_01' });
    expect(result.success).toBe(true);
  });
});

describe('createPrintJobSchema', () => {
  it('validates minimal input', () => {
    const result = createPrintJobSchema.safeParse({
      locationId: 'loc_01',
      printJobType: 'guest_check',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all optional fields', () => {
    const result = createPrintJobSchema.safeParse({
      locationId: 'loc_01',
      printJobType: 'receipt',
      ticketId: 'tk_01',
      tabId: 'tab_01',
      orderId: 'ord_01',
      stationId: 'stn_01',
      terminalId: 'term_01',
      printerId: 'printer_01',
      receiptCopy: 'merchant',
      formattedContent: 'test content',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid receiptCopy', () => {
    const result = createPrintJobSchema.safeParse({
      locationId: 'loc_01',
      printJobType: 'receipt',
      receiptCopy: 'server',
    });
    expect(result.success).toBe(false);
  });
});

describe('reprintJobSchema', () => {
  it('validates', () => {
    const result = reprintJobSchema.safeParse({ jobId: 'job_01' });
    expect(result.success).toBe(true);
  });

  it('accepts reason', () => {
    const result = reprintJobSchema.safeParse({
      jobId: 'job_01',
      reason: 'Customer requested reprint',
    });
    expect(result.success).toBe(true);
  });

  it('rejects reason over 200 chars', () => {
    const result = reprintJobSchema.safeParse({
      jobId: 'job_01',
      reason: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe('updatePrintJobStatusSchema', () => {
  it('validates', () => {
    const result = updatePrintJobStatusSchema.safeParse({
      jobId: 'job_01',
      status: 'completed',
    });
    expect(result.success).toBe(true);
  });

  it('accepts errorReason', () => {
    const result = updatePrintJobStatusSchema.safeParse({
      jobId: 'job_01',
      status: 'failed',
      errorReason: 'Printer offline',
    });
    expect(result.success).toBe(true);
  });
});

describe('Query Schemas', () => {
  it('listPrintJobsSchema validates with defaults', () => {
    const result = listPrintJobsSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('listPrintJobsSchema accepts filters', () => {
    const result = listPrintJobsSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      status: 'failed',
      printJobType: 'kitchen_chit',
      limit: 10,
    });
    expect(result.success).toBe(true);
  });

  it('getPrintJobSchema validates', () => {
    const result = getPrintJobSchema.safeParse({
      tenantId: 'tenant_01',
      jobId: 'job_01',
    });
    expect(result.success).toBe(true);
  });

  it('listRoutingRulesS14Schema validates', () => {
    const result = listRoutingRulesS14Schema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
    });
    expect(result.success).toBe(true);
  });

  it('listRoutingRulesS14Schema accepts filters', () => {
    const result = listRoutingRulesS14Schema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      stationId: 'stn_01',
      printJobType: 'expo_chit',
    });
    expect(result.success).toBe(true);
  });
});

describe('Render Schemas', () => {
  it('renderGuestCheckSchema validates', () => {
    const result = renderGuestCheckSchema.safeParse({
      tenantId: 'tenant_01',
      tabId: 'tab_01',
      orderId: 'ord_01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bySeat).toBe(false);
    }
  });

  it('renderReceiptSchema validates with defaults', () => {
    const result = renderReceiptSchema.safeParse({
      tenantId: 'tenant_01',
      tabId: 'tab_01',
      orderId: 'ord_01',
      paymentSessionId: 'ps_01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.copy).toBe('customer');
    }
  });

  it('renderKitchenChitSchema validates', () => {
    const result = renderKitchenChitSchema.safeParse({
      tenantId: 'tenant_01',
      ticketId: 'tk_01',
    });
    expect(result.success).toBe(true);
  });

  it('renderDeltaChitSchema validates', () => {
    const result = renderDeltaChitSchema.safeParse({
      tenantId: 'tenant_01',
      deltaChitId: 'dc_01',
    });
    expect(result.success).toBe(true);
  });

  it('renderExpoChitSchema validates', () => {
    const result = renderExpoChitSchema.safeParse({
      tenantId: 'tenant_01',
      ticketId: 'tk_01',
    });
    expect(result.success).toBe(true);
  });

  it('renderZReportSchema validates', () => {
    const result = renderZReportSchema.safeParse({
      tenantId: 'tenant_01',
      closeBatchId: 'cb_01',
    });
    expect(result.success).toBe(true);
  });
});
