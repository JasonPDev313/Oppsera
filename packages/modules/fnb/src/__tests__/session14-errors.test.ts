import { describe, it, expect } from 'vitest';
import {
  PrintJobNotFoundError,
  PrintRoutingRuleNotFoundError,
  NoPrinterRoutedError,
  PrintJobAlreadyCompletedError,
} from '../errors';

describe('Session 14 Errors', () => {
  it('PrintJobNotFoundError is 404', () => {
    const error = new PrintJobNotFoundError('job_01');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('PRINT_JOB_NOT_FOUND');
    expect(error.message).toContain('job_01');
  });

  it('PrintRoutingRuleNotFoundError is 404', () => {
    const error = new PrintRoutingRuleNotFoundError('rule_01');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('PRINT_ROUTING_RULE_NOT_FOUND');
    expect(error.message).toContain('rule_01');
  });

  it('NoPrinterRoutedError is 400', () => {
    const error = new NoPrinterRoutedError('kitchen_chit', 'loc_01');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('NO_PRINTER_ROUTED');
    expect(error.message).toContain('kitchen_chit');
    expect(error.message).toContain('loc_01');
  });

  it('PrintJobAlreadyCompletedError is 409', () => {
    const error = new PrintJobAlreadyCompletedError('job_01');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('PRINT_JOB_ALREADY_COMPLETED');
  });
});
