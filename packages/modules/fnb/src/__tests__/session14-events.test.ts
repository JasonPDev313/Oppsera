import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';
import type {
  PrintJobCreatedPayload,
  PrintJobCompletedPayload,
  PrintJobFailedPayload,
  PrintJobReprintedPayload,
} from '../events/types';

describe('Session 14 Events', () => {
  it('PRINT_JOB_CREATED is defined', () => {
    expect(FNB_EVENTS.PRINT_JOB_CREATED).toBe('fnb.print.job_created.v1');
  });

  it('PRINT_JOB_COMPLETED is defined', () => {
    expect(FNB_EVENTS.PRINT_JOB_COMPLETED).toBe('fnb.print.job_completed.v1');
  });

  it('PRINT_JOB_FAILED is defined', () => {
    expect(FNB_EVENTS.PRINT_JOB_FAILED).toBe('fnb.print.job_failed.v1');
  });

  it('PRINT_JOB_REPRINTED is defined', () => {
    expect(FNB_EVENTS.PRINT_JOB_REPRINTED).toBe('fnb.print.job_reprinted.v1');
  });
});

describe('Session 14 Payload Types', () => {
  it('PrintJobCreatedPayload shape', () => {
    const payload: PrintJobCreatedPayload = {
      jobId: 'job_01',
      locationId: 'loc_01',
      printJobType: 'kitchen_chit',
      printerId: 'printer_01',
      stationId: 'stn_01',
      ticketId: 'tk_01',
      tabId: null,
    };
    expect(payload.jobId).toBe('job_01');
    expect(payload.stationId).toBe('stn_01');
  });

  it('PrintJobCompletedPayload shape', () => {
    const payload: PrintJobCompletedPayload = {
      jobId: 'job_01',
      locationId: 'loc_01',
      printerId: 'printer_01',
      printJobType: 'guest_check',
      retryCount: 0,
    };
    expect(payload.retryCount).toBe(0);
  });

  it('PrintJobFailedPayload shape', () => {
    const payload: PrintJobFailedPayload = {
      jobId: 'job_01',
      locationId: 'loc_01',
      printerId: 'printer_01',
      printJobType: 'receipt',
      errorReason: 'Printer offline',
      retryCount: 3,
    };
    expect(payload.errorReason).toBe('Printer offline');
  });

  it('PrintJobReprintedPayload shape', () => {
    const payload: PrintJobReprintedPayload = {
      originalJobId: 'job_01',
      reprintJobId: 'job_02',
      locationId: 'loc_01',
      printJobType: 'guest_check',
      userId: 'user_01',
      reason: 'Customer requested',
    };
    expect(payload.reason).toBe('Customer requested');
  });
});
