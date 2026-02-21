import { describe, it, expect } from 'vitest';
import {
  createSectionSchema,
  updateSectionSchema,
  assignServerToSectionSchema,
  cutServerSchema,
  pickupSectionSchema,
  createShiftExtensionSchema,
  updateShiftStatusSchema,
  completeServerCheckoutSchema,
  advanceRotationSchema,
  listSectionsFilterSchema,
  listServerAssignmentsFilterSchema,
  getHostStandViewSchema,
} from '../validation';

describe('Session 2 Validation', () => {
  describe('createSectionSchema', () => {
    it('validates minimal input', () => {
      const result = createSectionSchema.safeParse({
        roomId: 'room-1',
        name: 'Patio A',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sortOrder).toBe(0);
      }
    });

    it('validates full input with color', () => {
      const result = createSectionSchema.safeParse({
        clientRequestId: 'req-1',
        roomId: 'room-1',
        name: 'Bar Rail',
        color: '#FF5733',
        sortOrder: 2,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid hex color', () => {
      const result = createSectionSchema.safeParse({
        roomId: 'room-1',
        name: 'Bad Color',
        color: 'red',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
      const result = createSectionSchema.safeParse({
        roomId: 'room-1',
        name: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateSectionSchema', () => {
    it('accepts partial update', () => {
      const result = updateSectionSchema.safeParse({ name: 'New Name' });
      expect(result.success).toBe(true);
    });

    it('accepts nullable color', () => {
      const result = updateSectionSchema.safeParse({ color: null });
      expect(result.success).toBe(true);
    });

    it('accepts isActive toggle', () => {
      const result = updateSectionSchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });
  });

  describe('assignServerToSectionSchema', () => {
    it('validates valid assignment', () => {
      const result = assignServerToSectionSchema.safeParse({
        sectionId: 'section-1',
        serverUserId: 'user-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid date format', () => {
      const result = assignServerToSectionSchema.safeParse({
        sectionId: 'section-1',
        serverUserId: 'user-1',
        businessDate: '02/21/2026',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('cutServerSchema', () => {
    it('validates valid input', () => {
      const result = cutServerSchema.safeParse({ assignmentId: 'assign-1' });
      expect(result.success).toBe(true);
    });

    it('rejects empty assignmentId', () => {
      const result = cutServerSchema.safeParse({ assignmentId: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('pickupSectionSchema', () => {
    it('validates valid input', () => {
      const result = pickupSectionSchema.safeParse({
        assignmentId: 'assign-1',
        newServerUserId: 'user-2',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createShiftExtensionSchema', () => {
    it('validates valid input', () => {
      const result = createShiftExtensionSchema.safeParse({
        employeeTimeEntryId: 'ete-1',
        serverUserId: 'user-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('updateShiftStatusSchema', () => {
    it('accepts all valid shift statuses', () => {
      const statuses = ['serving', 'cut', 'closing', 'checked_out'];
      for (const status of statuses) {
        const result = updateShiftStatusSchema.safeParse({ shiftStatus: status });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid shift status', () => {
      const result = updateShiftStatusSchema.safeParse({ shiftStatus: 'sleeping' });
      expect(result.success).toBe(false);
    });
  });

  describe('completeServerCheckoutSchema', () => {
    it('validates valid input', () => {
      const result = completeServerCheckoutSchema.safeParse({
        shiftExtensionId: 'shift-1',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('advanceRotationSchema', () => {
    it('validates valid input', () => {
      const result = advanceRotationSchema.safeParse({
        locationId: 'loc-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid date', () => {
      const result = advanceRotationSchema.safeParse({
        locationId: 'loc-1',
        businessDate: 'today',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('listSectionsFilterSchema', () => {
    it('validates minimal filter', () => {
      const result = listSectionsFilterSchema.safeParse({ tenantId: 'tenant-1' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isActive).toBe(true);
      }
    });

    it('validates full filter', () => {
      const result = listSectionsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        roomId: 'room-1',
        isActive: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('listServerAssignmentsFilterSchema', () => {
    it('validates minimal filter', () => {
      const result = listServerAssignmentsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(true);
    });

    it('validates with all filters', () => {
      const result = listServerAssignmentsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        businessDate: '2026-02-21',
        status: 'active',
        serverUserId: 'user-1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid assignment status', () => {
      const result = listServerAssignmentsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        businessDate: '2026-02-21',
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('accepts all valid assignment statuses', () => {
      const statuses = ['active', 'cut', 'picked_up', 'closed'];
      for (const status of statuses) {
        const result = listServerAssignmentsFilterSchema.safeParse({
          tenantId: 'tenant-1',
          businessDate: '2026-02-21',
          status,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('getHostStandViewSchema', () => {
    it('validates valid input', () => {
      const result = getHostStandViewSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing locationId', () => {
      const result = getHostStandViewSchema.safeParse({
        tenantId: 'tenant-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(false);
    });
  });
});
