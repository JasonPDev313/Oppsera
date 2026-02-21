import { describe, it, expect } from 'vitest';
import {
  EightySixLogNotFoundError,
  ItemAlreadyEightySixedError,
  MenuPeriodNotFoundError,
  DuplicateMenuPeriodNameError,
  AllergenNotFoundError,
  AvailabilityWindowNotFoundError,
} from '../errors';

describe('Session 6 Errors', () => {
  it('EightySixLogNotFoundError has code, message, 404 status', () => {
    const err = new EightySixLogNotFoundError('log-1');
    expect(err.code).toBe('EIGHTY_SIX_LOG_NOT_FOUND');
    expect(err.message).toContain('log-1');
    expect(err.statusCode).toBe(404);
  });

  it('ItemAlreadyEightySixedError has code, message, 409 status', () => {
    const err = new ItemAlreadyEightySixedError('item-1');
    expect(err.code).toBe('ITEM_ALREADY_86D');
    expect(err.message).toContain('item-1');
    expect(err.statusCode).toBe(409);
  });

  it('MenuPeriodNotFoundError has code, message, 404 status', () => {
    const err = new MenuPeriodNotFoundError('period-1');
    expect(err.code).toBe('MENU_PERIOD_NOT_FOUND');
    expect(err.message).toContain('period-1');
    expect(err.statusCode).toBe(404);
  });

  it('DuplicateMenuPeriodNameError has code, message, 409 status', () => {
    const err = new DuplicateMenuPeriodNameError('Lunch');
    expect(err.code).toBe('DUPLICATE_MENU_PERIOD_NAME');
    expect(err.message).toContain('Lunch');
    expect(err.statusCode).toBe(409);
  });

  it('AllergenNotFoundError has code, message, 404 status', () => {
    const err = new AllergenNotFoundError('al-1');
    expect(err.code).toBe('ALLERGEN_NOT_FOUND');
    expect(err.message).toContain('al-1');
    expect(err.statusCode).toBe(404);
  });

  it('AvailabilityWindowNotFoundError has code, message, 404 status', () => {
    const err = new AvailabilityWindowNotFoundError('win-1');
    expect(err.code).toBe('AVAILABILITY_WINDOW_NOT_FOUND');
    expect(err.message).toContain('win-1');
    expect(err.statusCode).toBe(404);
  });
});
