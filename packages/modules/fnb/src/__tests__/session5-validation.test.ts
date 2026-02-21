import { describe, it, expect } from 'vitest';
import {
  createStationSchema,
  updateStationSchema,
  upsertDisplayConfigSchema,
  bumpItemSchema,
  recallItemSchema,
  bumpTicketSchema,
  callBackToStationSchema,
  listStationsFilterSchema,
  getStationDetailSchema,
  getKdsViewSchema,
  getExpoViewSchema,
  getStationMetricsSchema,
  STATION_TYPES,
  DISPLAY_MODES,
  SORT_BY_OPTIONS,
} from '../validation';

describe('Session 5 Validation', () => {
  // ── Enums ──────────────────────────────────────────────────────

  describe('Enums', () => {
    it('defines STATION_TYPES', () => {
      expect(STATION_TYPES).toContain('prep');
      expect(STATION_TYPES).toContain('expo');
      expect(STATION_TYPES).toContain('bar');
      expect(STATION_TYPES).toHaveLength(3);
    });

    it('defines DISPLAY_MODES', () => {
      expect(DISPLAY_MODES).toContain('standard');
      expect(DISPLAY_MODES).toContain('compact');
      expect(DISPLAY_MODES).toContain('expo');
      expect(DISPLAY_MODES).toHaveLength(3);
    });

    it('defines SORT_BY_OPTIONS', () => {
      expect(SORT_BY_OPTIONS).toContain('time');
      expect(SORT_BY_OPTIONS).toContain('priority');
      expect(SORT_BY_OPTIONS).toContain('course');
      expect(SORT_BY_OPTIONS).toHaveLength(3);
    });
  });

  // ── createStationSchema ────────────────────────────────────────

  describe('createStationSchema', () => {
    it('validates minimal input with defaults', () => {
      const result = createStationSchema.safeParse({
        name: 'grill',
        displayName: 'Grill Station',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stationType).toBe('prep');
        expect(result.data.sortOrder).toBe(0);
        expect(result.data.warningThresholdSeconds).toBe(480);
        expect(result.data.criticalThresholdSeconds).toBe(720);
      }
    });

    it('validates full input', () => {
      const result = createStationSchema.safeParse({
        clientRequestId: 'req-1',
        name: 'expo',
        displayName: 'Expo Station',
        stationType: 'expo',
        color: '#FF5500',
        sortOrder: 5,
        fallbackStationId: 'station-backup',
        backupPrinterId: 'printer-1',
        terminalLocationId: 'terminal-1',
        warningThresholdSeconds: 600,
        criticalThresholdSeconds: 900,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing name', () => {
      const result = createStationSchema.safeParse({
        displayName: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing displayName', () => {
      const result = createStationSchema.safeParse({
        name: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid color format', () => {
      const result = createStationSchema.safeParse({
        name: 'test',
        displayName: 'Test',
        color: 'red',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid hex color', () => {
      const result = createStationSchema.safeParse({
        name: 'test',
        displayName: 'Test',
        color: '#AB12EF',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid station type', () => {
      const result = createStationSchema.safeParse({
        name: 'test',
        displayName: 'Test',
        stationType: 'kitchen',
      });
      expect(result.success).toBe(false);
    });

    it('validates all station types', () => {
      for (const st of STATION_TYPES) {
        const result = createStationSchema.safeParse({
          name: 'test',
          displayName: 'Test',
          stationType: st,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  // ── updateStationSchema ────────────────────────────────────────

  describe('updateStationSchema', () => {
    it('validates partial update', () => {
      const result = updateStationSchema.safeParse({
        displayName: 'New Name',
      });
      expect(result.success).toBe(true);
    });

    it('validates isActive toggle', () => {
      const result = updateStationSchema.safeParse({
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    it('accepts nullable color', () => {
      const result = updateStationSchema.safeParse({
        color: null,
      });
      expect(result.success).toBe(true);
    });

    it('validates full update', () => {
      const result = updateStationSchema.safeParse({
        clientRequestId: 'req-1',
        displayName: 'Updated',
        stationType: 'bar',
        color: '#00FF00',
        sortOrder: 10,
        fallbackStationId: null,
        backupPrinterId: 'printer-2',
        warningThresholdSeconds: 300,
        criticalThresholdSeconds: 600,
        isActive: true,
      });
      expect(result.success).toBe(true);
    });
  });

  // ── upsertDisplayConfigSchema ──────────────────────────────────

  describe('upsertDisplayConfigSchema', () => {
    it('validates minimal input with defaults', () => {
      const result = upsertDisplayConfigSchema.safeParse({
        stationId: 'station-1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.displayMode).toBe('standard');
        expect(result.data.columnsPerRow).toBe(4);
        expect(result.data.sortBy).toBe('time');
        expect(result.data.showModifiers).toBe(true);
        expect(result.data.showSeatNumbers).toBe(true);
        expect(result.data.showCourseHeaders).toBe(true);
        expect(result.data.autoScrollEnabled).toBe(false);
        expect(result.data.soundAlertEnabled).toBe(true);
      }
    });

    it('validates full input', () => {
      const result = upsertDisplayConfigSchema.safeParse({
        stationId: 'station-1',
        displayDeviceId: 'tablet-abc',
        displayMode: 'expo',
        columnsPerRow: 6,
        sortBy: 'priority',
        showModifiers: false,
        showSeatNumbers: true,
        showCourseHeaders: false,
        autoScrollEnabled: true,
        soundAlertEnabled: false,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing stationId', () => {
      const result = upsertDisplayConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects invalid displayMode', () => {
      const result = upsertDisplayConfigSchema.safeParse({
        stationId: 'station-1',
        displayMode: 'fullscreen',
      });
      expect(result.success).toBe(false);
    });

    it('rejects columnsPerRow over 8', () => {
      const result = upsertDisplayConfigSchema.safeParse({
        stationId: 'station-1',
        columnsPerRow: 9,
      });
      expect(result.success).toBe(false);
    });

    it('rejects columnsPerRow of 0', () => {
      const result = upsertDisplayConfigSchema.safeParse({
        stationId: 'station-1',
        columnsPerRow: 0,
      });
      expect(result.success).toBe(false);
    });

    it('validates all display modes', () => {
      for (const dm of DISPLAY_MODES) {
        const result = upsertDisplayConfigSchema.safeParse({
          stationId: 'station-1',
          displayMode: dm,
        });
        expect(result.success).toBe(true);
      }
    });

    it('validates all sort by options', () => {
      for (const sb of SORT_BY_OPTIONS) {
        const result = upsertDisplayConfigSchema.safeParse({
          stationId: 'station-1',
          sortBy: sb,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  // ── bumpItemSchema ─────────────────────────────────────────────

  describe('bumpItemSchema', () => {
    it('validates required fields', () => {
      const result = bumpItemSchema.safeParse({
        ticketItemId: 'item-1',
        stationId: 'station-1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing ticketItemId', () => {
      const result = bumpItemSchema.safeParse({
        stationId: 'station-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing stationId', () => {
      const result = bumpItemSchema.safeParse({
        ticketItemId: 'item-1',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── recallItemSchema ───────────────────────────────────────────

  describe('recallItemSchema', () => {
    it('validates required fields', () => {
      const result = recallItemSchema.safeParse({
        ticketItemId: 'item-1',
        stationId: 'station-1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing fields', () => {
      expect(recallItemSchema.safeParse({}).success).toBe(false);
      expect(recallItemSchema.safeParse({ ticketItemId: 'x' }).success).toBe(false);
    });
  });

  // ── bumpTicketSchema ───────────────────────────────────────────

  describe('bumpTicketSchema', () => {
    it('validates required fields', () => {
      const result = bumpTicketSchema.safeParse({
        ticketId: 'ticket-1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing ticketId', () => {
      const result = bumpTicketSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts with clientRequestId', () => {
      const result = bumpTicketSchema.safeParse({
        clientRequestId: 'req-1',
        ticketId: 'ticket-1',
      });
      expect(result.success).toBe(true);
    });
  });

  // ── callBackToStationSchema ────────────────────────────────────

  describe('callBackToStationSchema', () => {
    it('validates required fields', () => {
      const result = callBackToStationSchema.safeParse({
        ticketItemId: 'item-1',
        stationId: 'station-grill',
      });
      expect(result.success).toBe(true);
    });

    it('validates with optional reason', () => {
      const result = callBackToStationSchema.safeParse({
        ticketItemId: 'item-1',
        stationId: 'station-grill',
        reason: 'Quality issue — undercooked',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing ticketItemId', () => {
      const result = callBackToStationSchema.safeParse({
        stationId: 'station-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing stationId', () => {
      const result = callBackToStationSchema.safeParse({
        ticketItemId: 'item-1',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── listStationsFilterSchema ───────────────────────────────────

  describe('listStationsFilterSchema', () => {
    it('validates required fields with default isActive', () => {
      const result = listStationsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isActive).toBe(true);
      }
    });

    it('validates with optional stationType', () => {
      const result = listStationsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        stationType: 'expo',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing tenantId', () => {
      const result = listStationsFilterSchema.safeParse({
        locationId: 'loc-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing locationId', () => {
      const result = listStationsFilterSchema.safeParse({
        tenantId: 'tenant-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid stationType', () => {
      const result = listStationsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        stationType: 'kitchen',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── getStationDetailSchema ─────────────────────────────────────

  describe('getStationDetailSchema', () => {
    it('validates required fields', () => {
      const result = getStationDetailSchema.safeParse({
        tenantId: 'tenant-1',
        stationId: 'station-1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing tenantId', () => {
      const result = getStationDetailSchema.safeParse({
        stationId: 'station-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing stationId', () => {
      const result = getStationDetailSchema.safeParse({
        tenantId: 'tenant-1',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── getKdsViewSchema ───────────────────────────────────────────

  describe('getKdsViewSchema', () => {
    it('validates required fields', () => {
      const result = getKdsViewSchema.safeParse({
        tenantId: 'tenant-1',
        stationId: 'station-1',
        locationId: 'loc-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing stationId', () => {
      const result = getKdsViewSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid businessDate', () => {
      const result = getKdsViewSchema.safeParse({
        tenantId: 'tenant-1',
        stationId: 'station-1',
        locationId: 'loc-1',
        businessDate: '02-21-2026',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── getExpoViewSchema ──────────────────────────────────────────

  describe('getExpoViewSchema', () => {
    it('validates required fields', () => {
      const result = getExpoViewSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing locationId', () => {
      const result = getExpoViewSchema.safeParse({
        tenantId: 'tenant-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid businessDate', () => {
      const result = getExpoViewSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        businessDate: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── getStationMetricsSchema ────────────────────────────────────

  describe('getStationMetricsSchema', () => {
    it('validates required fields', () => {
      const result = getStationMetricsSchema.safeParse({
        tenantId: 'tenant-1',
        stationId: 'station-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing stationId', () => {
      const result = getStationMetricsSchema.safeParse({
        tenantId: 'tenant-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing businessDate', () => {
      const result = getStationMetricsSchema.safeParse({
        tenantId: 'tenant-1',
        stationId: 'station-1',
      });
      expect(result.success).toBe(false);
    });
  });
});
