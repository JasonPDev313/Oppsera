import { describe, it, expect } from 'vitest';
import { validateStaffImport } from '../staff-import-validator';
import type { ExistingUserLookup } from '../staff-import-validator';
import type { StaffColumnMapping, StaffValueMappings } from '../staff-import-types';

// ── Helpers ──────────────────────────────────────────────────────────

function buildMappings(fields: string[]): StaffColumnMapping[] {
  return fields.map((field, i) => ({
    columnIndex: i,
    sourceHeader: field,
    targetField: field as any,
    confidence: 95,
    explanation: 'test',
    alternatives: [],
    sampleValues: [],
  }));
}

function emptyLookup(): ExistingUserLookup {
  return {
    byEmail: new Map(),
    byUsername: new Map(),
    byPayrollId: new Map(),
  };
}

function emptyValueMappings(): StaffValueMappings {
  return { roles: [], locations: [] };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('validateStaffImport', () => {
  describe('basic validation', () => {
    it('validates a row with all required fields', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.isValid).toBe(true);
      expect(result.rows[0]!.action).toBe('create');
      expect(result.rows[0]!.firstName).toBe('John');
      expect(result.rows[0]!.lastName).toBe('Doe');
      expect(result.rows[0]!.email).toBe('john@test.com');
    });

    it('errors when no name is provided', () => {
      const result = validateStaffImport({
        rows: [['', '', 'john@test.com']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.isValid).toBe(false);
      expect(result.rows[0]!.errors.some((e) => e.code === 'MISSING_NAME')).toBe(true);
    });

    it('errors when no email or username is provided', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', '']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: false,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.isValid).toBe(false);
      expect(result.rows[0]!.errors.some((e) => e.code === 'MISSING_IDENTITY')).toBe(true);
    });

    it('errors on invalid email format', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'not-an-email']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.errors.some((e) => e.code === 'INVALID_EMAIL')).toBe(true);
    });
  });

  describe('auto-generate username', () => {
    it('generates username from email when autoGenerateUsername is true', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john.doe@company.com']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.username).toBe('john.doe');
    });

    it('generates username from first+last name when no email', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', '', 'manual_user']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'username']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      // username column was mapped and has a value so auto-generate doesn't override
      expect(result.rows[0]!.username).toBe('manual_user');
    });

    it('does not generate username when autoGenerateUsername is false', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: false,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.username).toBeNull();
    });
  });

  describe('PIN validation', () => {
    it('validates valid POS PIN', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', '1234']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'posPin']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.isValid).toBe(true);
      expect(result.rows[0]!.posPin).toBe('1234');
    });

    it('errors on PIN too short', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', '12']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'posPin']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.errors.some((e) => e.code === 'INVALID_PIN')).toBe(true);
    });

    it('errors on non-numeric PIN', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', 'abcd']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'posPin']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.errors.some((e) => e.code === 'INVALID_PIN')).toBe(true);
    });
  });

  describe('color validation', () => {
    it('warns on invalid hex color', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', 'red']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'tabColor']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      // Color invalid should be a warning, not an error
      expect(result.rows[0]!.isValid).toBe(true);
      expect(result.rows[0]!.warnings.some((w) => w.code === 'INVALID_COLOR')).toBe(true);
    });

    it('accepts valid hex color', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', '#FF5500']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'tabColor']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: 'some-role', // provide default to avoid NO_ROLE warning
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.warnings.some((w) => w.code === 'INVALID_COLOR')).toBe(false);
    });
  });

  describe('role resolution', () => {
    it('resolves role via value mapping', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', 'Manager']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'role']),
        valueMappings: {
          roles: [{ legacyValue: 'Manager', oppsEraRoleId: 'role-001', occurrenceCount: 1, confidence: 90 }],
          locations: [],
        },
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.roleId).toBe('role-001');
    });

    it('falls back to default role when unmapped', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', 'Custom Role']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'role']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: 'default-role',
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.roleId).toBe('default-role');
      expect(result.rows[0]!.warnings.some((w) => w.code === 'UNMAPPED_ROLE')).toBe(true);
    });

    it('errors when role unmapped and no default', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', 'Custom Role']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'role']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.errors.some((e) => e.code === 'UNMAPPED_ROLE')).toBe(true);
    });

    it('uses default role when no role column mapped', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: 'default-role',
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.roleId).toBe('default-role');
    });
  });

  describe('location resolution', () => {
    it('resolves locations via value mapping', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', 'Main Club']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'location']),
        valueMappings: {
          roles: [],
          locations: [{ legacyValue: 'Main Club', oppsEraLocationIds: ['loc-001', 'loc-002'], occurrenceCount: 1, confidence: 90 }],
        },
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.locationIds).toEqual(['loc-001', 'loc-002']);
    });

    it('falls back to default locations when unmapped', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', 'Unknown Place']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'location']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: ['loc-default'],
      });

      expect(result.rows[0]!.locationIds).toEqual(['loc-default']);
      expect(result.rows[0]!.warnings.some((w) => w.code === 'UNMAPPED_LOCATION')).toBe(true);
    });
  });

  describe('status normalization', () => {
    it('normalizes "yes" to "active"', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', 'Yes']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'status']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.statusValue).toBe('active');
    });

    it('normalizes "no" to "inactive"', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', 'No']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'status']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.statusValue).toBe('inactive');
    });

    it('normalizes "1" to "active"', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com', '1']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'status']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.statusValue).toBe('active');
    });

    it('defaults to "active" when no status column', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.statusValue).toBe('active');
    });
  });

  describe('duplicate detection', () => {
    it('detects existing user by email', () => {
      const lookup = emptyLookup();
      lookup.byEmail.set('john@test.com', 'user-001');

      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: lookup,
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.matchType).toBe('email_match');
      expect(result.rows[0]!.matchedUserId).toBe('user-001');
      expect(result.rows[0]!.action).toBe('update');
    });

    it('detects existing user by username', () => {
      const lookup = emptyLookup();
      lookup.byUsername.set('jdoe', 'user-002');

      const result = validateStaffImport({
        rows: [['John', 'Doe', '', 'jdoe']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'username']),
        valueMappings: emptyValueMappings(),
        existingUsers: lookup,
        importMode: 'upsert',
        autoGenerateUsername: false,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.matchType).toBe('username_match');
      expect(result.rows[0]!.matchedUserId).toBe('user-002');
    });

    it('detects existing user by payroll ID', () => {
      const lookup = emptyLookup();
      lookup.byPayrollId.set('EMP001', 'user-003');

      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@new.com', 'EMP001']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'externalPayrollEmployeeId']),
        valueMappings: emptyValueMappings(),
        existingUsers: lookup,
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.matchType).toBe('payroll_id_match');
      expect(result.rows[0]!.matchedUserId).toBe('user-003');
    });

    it('detects duplicate emails within the file', () => {
      const result = validateStaffImport({
        rows: [
          ['John', 'Doe', 'john@test.com'],
          ['John', 'Smith', 'john@test.com'],
        ],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.summary.duplicateEmailsInFile).toContain('john@test.com');
      expect(result.rows[1]!.warnings.some((w) => w.code === 'DUPLICATE_IN_FILE')).toBe(true);
    });
  });

  describe('import mode', () => {
    it('create_only: skips existing users', () => {
      const lookup = emptyLookup();
      lookup.byEmail.set('john@test.com', 'user-001');

      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: lookup,
        importMode: 'create_only',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.action).toBe('skip');
      expect(result.rows[0]!.warnings.some((w) => w.code === 'SKIPPED_EXISTS')).toBe(true);
    });

    it('update_only: skips new users', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', 'john@test.com']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'update_only',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.action).toBe('skip');
      expect(result.rows[0]!.warnings.some((w) => w.code === 'SKIPPED_NOT_FOUND')).toBe(true);
    });

    it('upsert: creates new and updates existing', () => {
      const lookup = emptyLookup();
      lookup.byEmail.set('jane@test.com', 'user-002');

      const result = validateStaffImport({
        rows: [
          ['John', 'Doe', 'john@test.com'],
          ['Jane', 'Smith', 'jane@test.com'],
        ],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: lookup,
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.action).toBe('create');
      expect(result.rows[1]!.action).toBe('update');
    });
  });

  describe('summary', () => {
    it('computes summary counts correctly', () => {
      const lookup = emptyLookup();
      lookup.byEmail.set('existing@test.com', 'user-001');

      const result = validateStaffImport({
        rows: [
          ['John', 'Doe', 'john@test.com'],         // create
          ['Jane', 'Smith', 'existing@test.com'],    // update
          ['', '', 'bad-email'],                       // error (no name + bad email)
        ],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: lookup,
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.summary.totalRows).toBe(3);
      expect(result.summary.createCount).toBe(1);
      expect(result.summary.updateCount).toBe(1);
      expect(result.summary.errorRows).toBe(1);
      expect(result.isValid).toBe(false);
    });

    it('tracks unmapped roles in summary', () => {
      const result = validateStaffImport({
        rows: [
          ['John', 'Doe', 'john@test.com', 'Custom Role A'],
          ['Jane', 'Smith', 'jane@test.com', 'Custom Role B'],
        ],
        columnMappings: buildMappings(['firstName', 'lastName', 'email', 'role']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: 'default-role',
        defaultLocationIds: [],
      });

      expect(result.summary.distinctRolesUnmapped).toContain('Custom Role A');
      expect(result.summary.distinctRolesUnmapped).toContain('Custom Role B');
    });
  });

  describe('row numbering', () => {
    it('uses 1-indexed row numbers starting from 2 (after header)', () => {
      const result = validateStaffImport({
        rows: [
          ['John', 'Doe', 'john@test.com'],
          ['Jane', 'Smith', 'jane@test.com'],
        ],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.rowNumber).toBe(2);
      expect(result.rows[1]!.rowNumber).toBe(3);
    });
  });

  describe('email normalization', () => {
    it('lowercases and trims emails', () => {
      const result = validateStaffImport({
        rows: [['John', 'Doe', '  John.Doe@Test.COM  ']],
        columnMappings: buildMappings(['firstName', 'lastName', 'email']),
        valueMappings: emptyValueMappings(),
        existingUsers: emptyLookup(),
        importMode: 'upsert',
        autoGenerateUsername: true,
        defaultRoleId: null,
        defaultLocationIds: [],
      });

      expect(result.rows[0]!.email).toBe('john.doe@test.com');
    });
  });
});
