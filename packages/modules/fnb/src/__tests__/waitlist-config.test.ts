import { describe, it, expect } from 'vitest';
import {
  waitlistConfigSchema,
  waitlistFormConfigSchema,
  waitlistNotificationConfigSchema,
  waitlistQueueConfigSchema,
  waitlistBrandingSchema,
  waitlistOperatingHoursSchema,
  getDefaultWaitlistConfig,
  mergeWaitlistConfig,
  mapWaitlistConfigRow,
} from '../services/waitlist-config';
import { HOST_EVENTS } from '../events/host-events';

// ── Default Parsing ─────────────────────────────────────────────────

describe('getDefaultWaitlistConfig', () => {
  it('returns valid defaults when parsing empty object', () => {
    const config = getDefaultWaitlistConfig();
    expect(config).toBeDefined();
    expect(config.formConfig).toBeDefined();
    expect(config.notificationConfig).toBeDefined();
    expect(config.queueConfig).toBeDefined();
    expect(config.branding).toBeDefined();
    expect(config.contentConfig).toBeDefined();
    expect(config.operatingHours).toBeDefined();
  });

  it('form config has correct defaults', () => {
    const config = getDefaultWaitlistConfig();
    expect(config.formConfig.minPartySize).toBe(1);
    expect(config.formConfig.maxPartySize).toBe(20);
    expect(config.formConfig.requirePhone).toBe(true);
    expect(config.formConfig.enableSeatingPreference).toBe(true);
    expect(config.formConfig.seatingOptions).toEqual(['Indoor', 'Outdoor', 'Bar', 'Patio']);
    expect(config.formConfig.enableOccasion).toBe(false);
    expect(config.formConfig.enableNotes).toBe(true);
    expect(config.formConfig.notesMaxLength).toBe(500);
    expect(config.formConfig.customFields).toEqual([]);
    expect(config.formConfig.termsText).toBeNull();
  });

  it('notification config has correct defaults', () => {
    const config = getDefaultWaitlistConfig();
    expect(config.notificationConfig.graceMinutes).toBe(10);
    expect(config.notificationConfig.autoRemoveAfterGrace).toBe(true);
    expect(config.notificationConfig.reminderEnabled).toBe(false);
    expect(config.notificationConfig.confirmationTemplate).toContain('{guest_name}');
    expect(config.notificationConfig.readyTemplate).toContain('{venue_name}');
    expect(config.notificationConfig.enableTwoWaySms).toBe(false);
  });

  it('queue config has correct defaults', () => {
    const config = getDefaultWaitlistConfig();
    expect(config.queueConfig.maxCapacity).toBe(50);
    expect(config.queueConfig.estimationMethod).toBe('auto');
    expect(config.queueConfig.autoPromotionEnabled).toBe(true);
    expect(config.queueConfig.promotionLogic).toBe('first_in_line');
    expect(config.queueConfig.priorityLevels).toEqual(['Normal', 'VIP']);
    expect(config.queueConfig.pacingEnabled).toBe(false);
    expect(config.queueConfig.allowCheckWaitBeforeJoining).toBe(true);
  });

  it('branding has correct defaults', () => {
    const config = getDefaultWaitlistConfig();
    expect(config.branding.primaryColor).toBe('#6366f1');
    expect(config.branding.secondaryColor).toBe('#3b82f6');
    expect(config.branding.accentColor).toBe('#22c55e');
    expect(config.branding.fontFamily).toBe('Inter');
    expect(config.branding.welcomeHeadline).toBe('Join Our Waitlist');
    expect(config.branding.logoUrl).toBeNull();
    expect(config.branding.customCss).toBeNull();
  });

  it('content config has correct defaults', () => {
    const config = getDefaultWaitlistConfig();
    expect(config.contentConfig.whileYouWaitEnabled).toBe(false);
    expect(config.contentConfig.whileYouWaitType).toBe('text');
    expect(config.contentConfig.whileYouWaitContent).toBeNull();
  });

  it('operating hours has correct defaults', () => {
    const config = getDefaultWaitlistConfig();
    expect(config.operatingHours.useBusinessHours).toBe(true);
    expect(config.operatingHours.customHours).toBeNull();
  });
});

// ── Schema Validation ───────────────────────────────────────────────

describe('waitlistFormConfigSchema', () => {
  it('rejects minPartySize < 1', () => {
    const result = waitlistFormConfigSchema.safeParse({ minPartySize: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects maxPartySize > 99', () => {
    const result = waitlistFormConfigSchema.safeParse({ maxPartySize: 100 });
    expect(result.success).toBe(false);
  });

  it('accepts valid custom fields', () => {
    const result = waitlistFormConfigSchema.safeParse({
      customFields: [
        { label: 'Member Number', type: 'text', required: true },
        { label: 'Hotel Room', type: 'number', required: false },
        { label: 'Occasion', type: 'select', required: false, options: ['Birthday', 'Anniversary'] },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data!.customFields).toHaveLength(3);
  });

  it('rejects custom field with empty label', () => {
    const result = waitlistFormConfigSchema.safeParse({
      customFields: [{ label: '', type: 'text', required: false }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects custom field with invalid type', () => {
    const result = waitlistFormConfigSchema.safeParse({
      customFields: [{ label: 'Foo', type: 'checkbox', required: false }],
    });
    expect(result.success).toBe(false);
  });
});

describe('waitlistQueueConfigSchema', () => {
  it('rejects maxCapacity > 500', () => {
    const result = waitlistQueueConfigSchema.safeParse({ maxCapacity: 501 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid estimation method', () => {
    const result = waitlistQueueConfigSchema.safeParse({ estimationMethod: 'ai' });
    expect(result.success).toBe(false);
  });

  it('accepts valid promotion logic values', () => {
    for (const logic of ['first_in_line', 'best_fit', 'priority_first']) {
      const result = waitlistQueueConfigSchema.safeParse({ promotionLogic: logic });
      expect(result.success).toBe(true);
    }
  });
});

describe('waitlistBrandingSchema', () => {
  it('rejects invalid logo URL', () => {
    const result = waitlistBrandingSchema.safeParse({ logoUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('accepts null logo URL', () => {
    const result = waitlistBrandingSchema.safeParse({ logoUrl: null });
    expect(result.success).toBe(true);
  });

  it('accepts valid font families', () => {
    for (const font of ['Inter', 'Plus Jakarta Sans', 'DM Sans', 'Poppins', 'system-ui']) {
      const result = waitlistBrandingSchema.safeParse({ fontFamily: font });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid font family', () => {
    const result = waitlistBrandingSchema.safeParse({ fontFamily: 'Comic Sans' });
    expect(result.success).toBe(false);
  });
});

describe('waitlistNotificationConfigSchema', () => {
  it('rejects graceMinutes < 3', () => {
    const result = waitlistNotificationConfigSchema.safeParse({ graceMinutes: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects graceMinutes > 60', () => {
    const result = waitlistNotificationConfigSchema.safeParse({ graceMinutes: 61 });
    expect(result.success).toBe(false);
  });

  it('allows custom templates', () => {
    const result = waitlistNotificationConfigSchema.safeParse({
      confirmationTemplate: 'Hey {guest_name}, sit tight!',
      readyTemplate: '{guest_name}, come eat!',
    });
    expect(result.success).toBe(true);
  });
});

describe('waitlistOperatingHoursSchema', () => {
  it('accepts valid custom hours', () => {
    const result = waitlistOperatingHoursSchema.safeParse({
      useBusinessHours: false,
      customHours: {
        mon: { open: '11:00', close: '22:00' },
        tue: { open: '11:00', close: '22:00' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid time format', () => {
    const result = waitlistOperatingHoursSchema.safeParse({
      useBusinessHours: false,
      customHours: {
        mon: { open: '11am', close: '10pm' },
      },
    });
    expect(result.success).toBe(false);
  });
});

// ── Deep Merge ──────────────────────────────────────────────────────

describe('mergeWaitlistConfig', () => {
  it('preserves unchanged sections', () => {
    const defaults = getDefaultWaitlistConfig();
    const merged = mergeWaitlistConfig(defaults, {
      branding: { primaryColor: '#ff0000' },
    });

    // Branding updated
    expect(merged.branding.primaryColor).toBe('#ff0000');
    // Other branding fields preserved
    expect(merged.branding.secondaryColor).toBe('#3b82f6');
    expect(merged.branding.fontFamily).toBe('Inter');
    // Other sections untouched
    expect(merged.formConfig.maxPartySize).toBe(20);
    expect(merged.queueConfig.maxCapacity).toBe(50);
    expect(merged.notificationConfig.graceMinutes).toBe(10);
  });

  it('merges multiple sections at once', () => {
    const defaults = getDefaultWaitlistConfig();
    const merged = mergeWaitlistConfig(defaults, {
      formConfig: { maxPartySize: 12, enableOccasion: true },
      queueConfig: { maxCapacity: 100 },
    });

    expect(merged.formConfig.maxPartySize).toBe(12);
    expect(merged.formConfig.enableOccasion).toBe(true);
    expect(merged.formConfig.minPartySize).toBe(1); // preserved
    expect(merged.queueConfig.maxCapacity).toBe(100);
    expect(merged.queueConfig.autoPromotionEnabled).toBe(true); // preserved
  });

  it('replaces arrays entirely (does not merge)', () => {
    const defaults = getDefaultWaitlistConfig();
    const merged = mergeWaitlistConfig(defaults, {
      formConfig: { seatingOptions: ['Deck', 'Rooftop'] },
    });

    expect(merged.formConfig.seatingOptions).toEqual(['Deck', 'Rooftop']);
  });

  it('validates merged result', () => {
    const defaults = getDefaultWaitlistConfig();
    // Invalid value should be caught by schema validation
    expect(() =>
      mergeWaitlistConfig(defaults, {
        formConfig: { maxPartySize: 0 } as unknown as Record<string, unknown>,
      }),
    ).toThrow();
  });
});

// ── Row Mapping ─────────────────────────────────────────────────────

describe('mapWaitlistConfigRow', () => {
  it('maps a complete DB row', () => {
    const row: Record<string, unknown> = {
      id: 'test-id',
      tenant_id: 'tenant-1',
      location_id: 'loc-1',
      enabled: true,
      slug_override: 'joes-grill',
      form_config: { maxPartySize: 10 },
      notification_config: {},
      queue_config: { maxCapacity: 80 },
      branding: { primaryColor: '#ff0000' },
      content_config: {},
      operating_hours: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const result = mapWaitlistConfigRow(row);
    expect(result.id).toBe('test-id');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.locationId).toBe('loc-1');
    expect(result.enabled).toBe(true);
    expect(result.slugOverride).toBe('joes-grill');
    expect(result.formConfig.maxPartySize).toBe(10);
    expect(result.formConfig.minPartySize).toBe(1); // default filled
    expect(result.queueConfig.maxCapacity).toBe(80);
    expect(result.branding.primaryColor).toBe('#ff0000');
    expect(result.branding.secondaryColor).toBe('#3b82f6'); // default filled
  });

  it('handles null location_id', () => {
    const row: Record<string, unknown> = {
      id: 'test-id',
      tenant_id: 'tenant-1',
      location_id: null,
      enabled: false,
      slug_override: null,
      form_config: {},
      notification_config: {},
      queue_config: {},
      branding: {},
      content_config: {},
      operating_hours: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const result = mapWaitlistConfigRow(row);
    expect(result.locationId).toBeNull();
    expect(result.slugOverride).toBeNull();
  });

  it('fills defaults for missing JSONB fields', () => {
    const row: Record<string, unknown> = {
      id: 'test-id',
      tenant_id: 'tenant-1',
      location_id: 'loc-1',
      enabled: false,
      slug_override: null,
      form_config: null,
      notification_config: null,
      queue_config: null,
      branding: null,
      content_config: null,
      operating_hours: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const result = mapWaitlistConfigRow(row);
    // Should parse to defaults without throwing
    expect(result.formConfig.maxPartySize).toBe(20);
    expect(result.queueConfig.maxCapacity).toBe(50);
    expect(result.branding.primaryColor).toBe('#6366f1');
  });
});

// ── Event Constants ─────────────────────────────────────────────────

describe('HOST_EVENTS', () => {
  it('includes WAITLIST_SETTINGS_UPDATED event', () => {
    expect(HOST_EVENTS.WAITLIST_SETTINGS_UPDATED).toBe('fnb.waitlist.settings_updated.v1');
  });
});

// ── Full Config Schema ──────────────────────────────────────────────

describe('waitlistConfigSchema', () => {
  it('parses empty object to full defaults', () => {
    const result = waitlistConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.formConfig.maxPartySize).toBe(20);
      expect(result.data.notificationConfig.graceMinutes).toBe(10);
      expect(result.data.queueConfig.maxCapacity).toBe(50);
      expect(result.data.branding.primaryColor).toBe('#6366f1');
    }
  });

  it('parses partial overrides', () => {
    const result = waitlistConfigSchema.safeParse({
      formConfig: { maxPartySize: 8 },
      branding: { primaryColor: '#000000', welcomeHeadline: 'Get in Line' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.formConfig.maxPartySize).toBe(8);
      expect(result.data.formConfig.minPartySize).toBe(1);
      expect(result.data.branding.primaryColor).toBe('#000000');
      expect(result.data.branding.welcomeHeadline).toBe('Get in Line');
      expect(result.data.branding.secondaryColor).toBe('#3b82f6');
    }
  });
});
