import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';
import type { SettingsUpdatedPayload } from '../events/types';

describe('Session 12 Events', () => {
  it('has SETTINGS_UPDATED event constant', () => {
    expect(FNB_EVENTS.SETTINGS_UPDATED).toBe('fnb.settings.updated.v1');
  });

  it('event constant follows naming convention', () => {
    expect(FNB_EVENTS.SETTINGS_UPDATED).toMatch(
      /^fnb\.[a-z][a-z_]*(\.[a-z][a-z_]*)+\.v\d+$/,
    );
  });

  it('payload interface is structurally valid', () => {
    const payload: SettingsUpdatedPayload = {
      moduleKey: 'fnb_general',
      locationId: 'loc-1',
      changedKeys: ['covers_tracking_enabled', 'rounding_rule'],
      updatedBy: 'user-1',
    };
    expect(payload.changedKeys).toHaveLength(2);
    expect(payload.moduleKey).toBe('fnb_general');
  });

  it('payload supports null locationId for tenant-level', () => {
    const payload: SettingsUpdatedPayload = {
      moduleKey: 'fnb_kitchen',
      locationId: null,
      changedKeys: ['kds_warning_threshold_seconds'],
      updatedBy: 'user-1',
    };
    expect(payload.locationId).toBeNull();
  });
});
