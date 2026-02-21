import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';
import type {
  ItemEightySixedPayload,
  ItemRestoredPayload,
  MenuPeriodCreatedPayload,
  MenuPeriodUpdatedPayload,
  AllergenTaggedPayload,
} from '../events/types';

describe('Session 6 Events', () => {
  it('has all Session 6 event constants', () => {
    expect(FNB_EVENTS.ITEM_EIGHTY_SIXED).toBe('fnb.menu.item_eighty_sixed.v1');
    expect(FNB_EVENTS.ITEM_RESTORED).toBe('fnb.menu.item_restored.v1');
    expect(FNB_EVENTS.MENU_PERIOD_CREATED).toBe('fnb.menu.period_created.v1');
    expect(FNB_EVENTS.MENU_PERIOD_UPDATED).toBe('fnb.menu.period_updated.v1');
    expect(FNB_EVENTS.ALLERGEN_TAGGED).toBe('fnb.menu.allergen_tagged.v1');
  });

  it('event constants follow naming convention', () => {
    const s6Events = [
      FNB_EVENTS.ITEM_EIGHTY_SIXED,
      FNB_EVENTS.ITEM_RESTORED,
      FNB_EVENTS.MENU_PERIOD_CREATED,
      FNB_EVENTS.MENU_PERIOD_UPDATED,
      FNB_EVENTS.ALLERGEN_TAGGED,
    ];
    for (const evt of s6Events) {
      expect(evt).toMatch(/^fnb\.[a-z][a-z_]*(\.[a-z][a-z_]*)+\.v\d+$/);
    }
  });

  it('payload interfaces are structurally valid', () => {
    const eightySixed: ItemEightySixedPayload = {
      eightySixLogId: 'log-1',
      locationId: 'loc-1',
      entityType: 'item',
      entityId: 'item-1',
      stationId: null,
      reason: 'Out of stock',
      businessDate: '2026-02-21',
    };
    expect(eightySixed.eightySixLogId).toBe('log-1');

    const restored: ItemRestoredPayload = {
      eightySixLogId: 'log-1',
      locationId: 'loc-1',
      entityType: 'item',
      entityId: 'item-1',
    };
    expect(restored.entityType).toBe('item');

    const periodCreated: MenuPeriodCreatedPayload = {
      menuPeriodId: 'mp-1',
      locationId: 'loc-1',
      name: 'Lunch',
    };
    expect(periodCreated.name).toBe('Lunch');

    const periodUpdated: MenuPeriodUpdatedPayload = {
      menuPeriodId: 'mp-1',
      locationId: 'loc-1',
      changes: { name: 'Brunch' },
    };
    expect(periodUpdated.changes).toEqual({ name: 'Brunch' });

    const tagged: AllergenTaggedPayload = {
      catalogItemId: 'item-1',
      allergenId: 'al-1',
      allergenName: 'Peanut',
    };
    expect(tagged.allergenName).toBe('Peanut');
  });
});
