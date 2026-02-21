import { describe, it, expect } from 'vitest';
import {
  ENTITY_86_TYPES,
  ALLERGEN_SEVERITIES,
  AVAILABILITY_ENTITY_TYPES,
  eightySixItemSchema,
  restoreItemSchema,
  createMenuPeriodSchema,
  updateMenuPeriodSchema,
  createAvailabilityWindowSchema,
  updateAvailabilityWindowSchema,
  createAllergenSchema,
  tagItemAllergenSchema,
  removeItemAllergenSchema,
  createPrepNotePresetSchema,
  listEightySixedSchema,
  listMenuPeriodsSchema,
  getAvailableMenuSchema,
  listAllergensSchema,
  getItemAllergensSchema,
  listPrepNotePresetsSchema,
} from '../validation';

// ── Enum Constants ──────────────────────────────────────────────

describe('Session 6 Enums', () => {
  it('ENTITY_86_TYPES has expected values', () => {
    expect(ENTITY_86_TYPES).toEqual(['item', 'modifier']);
  });

  it('ALLERGEN_SEVERITIES has expected values', () => {
    expect(ALLERGEN_SEVERITIES).toEqual(['standard', 'severe']);
  });

  it('AVAILABILITY_ENTITY_TYPES has expected values', () => {
    expect(AVAILABILITY_ENTITY_TYPES).toEqual(['item', 'category']);
  });
});

// ── eightySixItemSchema ─────────────────────────────────────────

describe('eightySixItemSchema', () => {
  const valid = {
    entityId: 'item-1',
    businessDate: '2026-02-21',
  };

  it('accepts minimal valid input', () => {
    const result = eightySixItemSchema.parse(valid);
    expect(result.entityId).toBe('item-1');
    expect(result.entityType).toBe('item'); // default
    expect(result.autoRestoreAtDayEnd).toBe(true); // default
  });

  it('accepts all optional fields', () => {
    const result = eightySixItemSchema.parse({
      ...valid,
      entityType: 'modifier',
      stationId: 'sta-1',
      reason: 'Out of stock',
      autoRestoreAtDayEnd: false,
      clientRequestId: 'req-1',
    });
    expect(result.entityType).toBe('modifier');
    expect(result.stationId).toBe('sta-1');
    expect(result.reason).toBe('Out of stock');
    expect(result.autoRestoreAtDayEnd).toBe(false);
  });

  it('rejects invalid entityType', () => {
    expect(() => eightySixItemSchema.parse({ ...valid, entityType: 'unknown' })).toThrow();
  });

  it('rejects missing entityId', () => {
    expect(() => eightySixItemSchema.parse({ businessDate: '2026-02-21' })).toThrow();
  });

  it('rejects invalid businessDate format', () => {
    expect(() => eightySixItemSchema.parse({ ...valid, businessDate: '2026/02/21' })).toThrow();
  });
});

// ── restoreItemSchema ───────────────────────────────────────────

describe('restoreItemSchema', () => {
  it('accepts valid input', () => {
    const result = restoreItemSchema.parse({ eightySixLogId: 'log-1' });
    expect(result.eightySixLogId).toBe('log-1');
  });

  it('rejects missing eightySixLogId', () => {
    expect(() => restoreItemSchema.parse({})).toThrow();
  });

  it('rejects empty eightySixLogId', () => {
    expect(() => restoreItemSchema.parse({ eightySixLogId: '' })).toThrow();
  });
});

// ── createMenuPeriodSchema ──────────────────────────────────────

describe('createMenuPeriodSchema', () => {
  const valid = {
    name: 'Lunch',
    startTime: '11:00',
    endTime: '14:00',
    daysOfWeek: [1, 2, 3, 4, 5],
  };

  it('accepts minimal valid input', () => {
    const result = createMenuPeriodSchema.parse(valid);
    expect(result.name).toBe('Lunch');
    expect(result.sortOrder).toBe(0); // default
  });

  it('accepts optional sortOrder', () => {
    const result = createMenuPeriodSchema.parse({ ...valid, sortOrder: 5 });
    expect(result.sortOrder).toBe(5);
  });

  it('rejects invalid time format', () => {
    expect(() => createMenuPeriodSchema.parse({ ...valid, startTime: '11:00:00' })).toThrow();
  });

  it('rejects empty daysOfWeek', () => {
    expect(() => createMenuPeriodSchema.parse({ ...valid, daysOfWeek: [] })).toThrow();
  });

  it('rejects day out of range', () => {
    expect(() => createMenuPeriodSchema.parse({ ...valid, daysOfWeek: [7] })).toThrow();
  });

  it('rejects name exceeding 100 chars', () => {
    expect(() => createMenuPeriodSchema.parse({ ...valid, name: 'x'.repeat(101) })).toThrow();
  });
});

// ── updateMenuPeriodSchema ──────────────────────────────────────

describe('updateMenuPeriodSchema', () => {
  it('accepts partial update', () => {
    const result = updateMenuPeriodSchema.parse({ name: 'Brunch' });
    expect(result.name).toBe('Brunch');
  });

  it('accepts isActive toggle', () => {
    const result = updateMenuPeriodSchema.parse({ isActive: false });
    expect(result.isActive).toBe(false);
  });

  it('accepts empty update (all optional)', () => {
    const result = updateMenuPeriodSchema.parse({});
    expect(result).toBeDefined();
  });

  it('rejects invalid time format for startTime', () => {
    expect(() => updateMenuPeriodSchema.parse({ startTime: '1pm' })).toThrow();
  });
});

// ── createAvailabilityWindowSchema ──────────────────────────────

describe('createAvailabilityWindowSchema', () => {
  const valid = {
    entityType: 'item' as const,
    entityId: 'item-1',
  };

  it('accepts minimal valid input', () => {
    const result = createAvailabilityWindowSchema.parse(valid);
    expect(result.entityType).toBe('item');
    expect(result.hideWhenUnavailable).toBe(false); // default
  });

  it('accepts all optional fields', () => {
    const result = createAvailabilityWindowSchema.parse({
      ...valid,
      menuPeriodId: 'period-1',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      hideWhenUnavailable: true,
    });
    expect(result.menuPeriodId).toBe('period-1');
    expect(result.hideWhenUnavailable).toBe(true);
  });

  it('accepts category entityType', () => {
    const result = createAvailabilityWindowSchema.parse({ entityType: 'category', entityId: 'cat-1' });
    expect(result.entityType).toBe('category');
  });

  it('rejects invalid entityType', () => {
    expect(() => createAvailabilityWindowSchema.parse({ entityType: 'menu', entityId: 'x' })).toThrow();
  });

  it('rejects invalid date format', () => {
    expect(() => createAvailabilityWindowSchema.parse({ ...valid, startDate: 'March 1' })).toThrow();
  });
});

// ── updateAvailabilityWindowSchema ──────────────────────────────

describe('updateAvailabilityWindowSchema', () => {
  it('accepts partial update', () => {
    const result = updateAvailabilityWindowSchema.parse({ hideWhenUnavailable: true });
    expect(result.hideWhenUnavailable).toBe(true);
  });

  it('accepts nullable fields', () => {
    const result = updateAvailabilityWindowSchema.parse({ menuPeriodId: null, startDate: null, endDate: null });
    expect(result.menuPeriodId).toBeNull();
    expect(result.startDate).toBeNull();
    expect(result.endDate).toBeNull();
  });

  it('accepts isActive toggle', () => {
    const result = updateAvailabilityWindowSchema.parse({ isActive: false });
    expect(result.isActive).toBe(false);
  });
});

// ── createAllergenSchema ────────────────────────────────────────

describe('createAllergenSchema', () => {
  it('accepts minimal valid input', () => {
    const result = createAllergenSchema.parse({ name: 'Peanut' });
    expect(result.name).toBe('Peanut');
    expect(result.severity).toBe('standard'); // default
    expect(result.sortOrder).toBe(0); // default
  });

  it('accepts all optional fields', () => {
    const result = createAllergenSchema.parse({
      name: 'Tree Nut',
      icon: 'nut-icon',
      severity: 'severe',
      sortOrder: 3,
    });
    expect(result.severity).toBe('severe');
    expect(result.icon).toBe('nut-icon');
  });

  it('rejects invalid severity', () => {
    expect(() => createAllergenSchema.parse({ name: 'Test', severity: 'mild' })).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => createAllergenSchema.parse({ name: '' })).toThrow();
  });

  it('rejects name exceeding 100 chars', () => {
    expect(() => createAllergenSchema.parse({ name: 'x'.repeat(101) })).toThrow();
  });
});

// ── tagItemAllergenSchema ───────────────────────────────────────

describe('tagItemAllergenSchema', () => {
  it('accepts valid input', () => {
    const result = tagItemAllergenSchema.parse({ catalogItemId: 'item-1', allergenId: 'al-1' });
    expect(result.catalogItemId).toBe('item-1');
    expect(result.allergenId).toBe('al-1');
  });

  it('accepts optional notes', () => {
    const result = tagItemAllergenSchema.parse({ catalogItemId: 'item-1', allergenId: 'al-1', notes: 'Contains traces' });
    expect(result.notes).toBe('Contains traces');
  });

  it('rejects missing catalogItemId', () => {
    expect(() => tagItemAllergenSchema.parse({ allergenId: 'al-1' })).toThrow();
  });

  it('rejects missing allergenId', () => {
    expect(() => tagItemAllergenSchema.parse({ catalogItemId: 'item-1' })).toThrow();
  });
});

// ── removeItemAllergenSchema ────────────────────────────────────

describe('removeItemAllergenSchema', () => {
  it('accepts valid input', () => {
    const result = removeItemAllergenSchema.parse({ catalogItemId: 'item-1', allergenId: 'al-1' });
    expect(result.catalogItemId).toBe('item-1');
  });

  it('rejects empty catalogItemId', () => {
    expect(() => removeItemAllergenSchema.parse({ catalogItemId: '', allergenId: 'al-1' })).toThrow();
  });
});

// ── createPrepNotePresetSchema ──────────────────────────────────

describe('createPrepNotePresetSchema', () => {
  it('accepts minimal valid input', () => {
    const result = createPrepNotePresetSchema.parse({ noteText: 'Extra crispy' });
    expect(result.noteText).toBe('Extra crispy');
    expect(result.sortOrder).toBe(0); // default
  });

  it('accepts optional catalogItemId', () => {
    const result = createPrepNotePresetSchema.parse({ noteText: 'No onions', catalogItemId: 'item-1' });
    expect(result.catalogItemId).toBe('item-1');
  });

  it('rejects empty noteText', () => {
    expect(() => createPrepNotePresetSchema.parse({ noteText: '' })).toThrow();
  });

  it('rejects noteText exceeding 200 chars', () => {
    expect(() => createPrepNotePresetSchema.parse({ noteText: 'x'.repeat(201) })).toThrow();
  });
});

// ── Query Filter Schemas ────────────────────────────────────────

describe('listEightySixedSchema', () => {
  const valid = {
    tenantId: 't-1',
    locationId: 'loc-1',
    businessDate: '2026-02-21',
  };

  it('accepts valid input with defaults', () => {
    const result = listEightySixedSchema.parse(valid);
    expect(result.activeOnly).toBe(true); // default
  });

  it('accepts optional entityType filter', () => {
    const result = listEightySixedSchema.parse({ ...valid, entityType: 'modifier' });
    expect(result.entityType).toBe('modifier');
  });

  it('accepts activeOnly override', () => {
    const result = listEightySixedSchema.parse({ ...valid, activeOnly: false });
    expect(result.activeOnly).toBe(false);
  });

  it('rejects missing tenantId', () => {
    expect(() => listEightySixedSchema.parse({ locationId: 'loc-1', businessDate: '2026-02-21' })).toThrow();
  });
});

describe('listMenuPeriodsSchema', () => {
  it('accepts valid input with default isActive', () => {
    const result = listMenuPeriodsSchema.parse({ tenantId: 't-1', locationId: 'loc-1' });
    expect(result.isActive).toBe(true);
  });

  it('accepts isActive override', () => {
    const result = listMenuPeriodsSchema.parse({ tenantId: 't-1', locationId: 'loc-1', isActive: false });
    expect(result.isActive).toBe(false);
  });

  it('rejects missing locationId', () => {
    expect(() => listMenuPeriodsSchema.parse({ tenantId: 't-1' })).toThrow();
  });
});

describe('getAvailableMenuSchema', () => {
  const valid = {
    tenantId: 't-1',
    locationId: 'loc-1',
    dayOfWeek: 3,
    timeOfDay: '12:30',
    businessDate: '2026-02-21',
  };

  it('accepts valid input', () => {
    const result = getAvailableMenuSchema.parse(valid);
    expect(result.dayOfWeek).toBe(3);
    expect(result.timeOfDay).toBe('12:30');
  });

  it('rejects dayOfWeek out of range', () => {
    expect(() => getAvailableMenuSchema.parse({ ...valid, dayOfWeek: 7 })).toThrow();
    expect(() => getAvailableMenuSchema.parse({ ...valid, dayOfWeek: -1 })).toThrow();
  });

  it('rejects invalid timeOfDay', () => {
    expect(() => getAvailableMenuSchema.parse({ ...valid, timeOfDay: '1pm' })).toThrow();
  });
});

describe('listAllergensSchema', () => {
  it('accepts valid input', () => {
    const result = listAllergensSchema.parse({ tenantId: 't-1' });
    expect(result.tenantId).toBe('t-1');
  });

  it('rejects missing tenantId', () => {
    expect(() => listAllergensSchema.parse({})).toThrow();
  });
});

describe('getItemAllergensSchema', () => {
  it('accepts valid input', () => {
    const result = getItemAllergensSchema.parse({ tenantId: 't-1', catalogItemId: 'item-1' });
    expect(result.catalogItemId).toBe('item-1');
  });

  it('rejects missing catalogItemId', () => {
    expect(() => getItemAllergensSchema.parse({ tenantId: 't-1' })).toThrow();
  });
});

describe('listPrepNotePresetsSchema', () => {
  it('accepts minimal valid input', () => {
    const result = listPrepNotePresetsSchema.parse({ tenantId: 't-1' });
    expect(result.tenantId).toBe('t-1');
  });

  it('accepts optional location and item filters', () => {
    const result = listPrepNotePresetsSchema.parse({
      tenantId: 't-1',
      locationId: 'loc-1',
      catalogItemId: 'item-1',
    });
    expect(result.locationId).toBe('loc-1');
    expect(result.catalogItemId).toBe('item-1');
  });
});
