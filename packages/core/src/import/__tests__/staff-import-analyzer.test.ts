import { describe, it, expect } from 'vitest';
import { analyzeStaffColumns } from '../staff-import-analyzer';

describe('analyzeStaffColumns', () => {
  describe('alias matching', () => {
    it('maps exact alias headers with high confidence', () => {
      const headers = ['first_name', 'last_name', 'email', 'username'];
      const sampleRows = [
        ['John', 'Doe', 'john@test.com', 'jdoe'],
        ['Jane', 'Smith', 'jane@test.com', 'jsmith'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      const firstName = result.columns.find((c) => c.targetField === 'firstName');
      expect(firstName).toBeDefined();
      expect(firstName!.confidence).toBeGreaterThanOrEqual(90);

      const lastName = result.columns.find((c) => c.targetField === 'lastName');
      expect(lastName).toBeDefined();

      const email = result.columns.find((c) => c.targetField === 'email');
      expect(email).toBeDefined();
      expect(email!.confidence).toBeGreaterThanOrEqual(90);

      const username = result.columns.find((c) => c.targetField === 'username');
      expect(username).toBeDefined();
    });

    it('maps common variations', () => {
      const headers = ['First Name', 'Last Name', 'E-Mail', 'Login', 'Phone Number'];
      const sampleRows = [
        ['John', 'Doe', 'john@test.com', 'jdoe', '555-1234'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      expect(result.columns.find((c) => c.targetField === 'firstName')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'lastName')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'email')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'username')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'phone')).toBeDefined();
    });

    it('maps POS-specific fields', () => {
      const headers = ['Name', 'POS Pin', 'Override Pin', 'Tab Color', 'Employee Color'];
      const sampleRows = [
        ['John', '1234', '5678', '#FF0000', '#00FF00'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      expect(result.columns.find((c) => c.targetField === 'posPin')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'overridePin')).toBeDefined();
    });

    it('maps payroll fields', () => {
      const headers = ['Employee ID', 'External Payroll ID', 'Email'];
      const sampleRows = [
        ['EMP001', 'HRIS-123', 'john@test.com'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      expect(result.columns.find((c) => c.targetField === 'externalPayrollEmployeeId')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'externalPayrollId')).toBeDefined();
    });
  });

  describe('pattern detection', () => {
    it('detects email pattern from data', () => {
      const headers = ['col1', 'col2'];
      const sampleRows = [
        ['John', 'john@company.com'],
        ['Jane', 'jane@company.com'],
        ['Bob', 'bob@company.com'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      const emailCol = result.columns.find((c) => c.targetField === 'email');
      expect(emailCol).toBeDefined();
      expect(emailCol!.columnIndex).toBe(1);
    });

    it('detects boolean/status pattern from data', () => {
      const headers = ['name', 'is_active'];
      const sampleRows = [
        ['John', 'yes'],
        ['Jane', 'no'],
        ['Bob', 'yes'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      const statusCol = result.columns.find((c) => c.targetField === 'status');
      expect(statusCol).toBeDefined();
    });

    it('detects PIN pattern from data', () => {
      const headers = ['name', 'pin_code'];
      const sampleRows = [
        ['John', '1234'],
        ['Jane', '5678'],
        ['Bob', '9012'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      const pinCol = result.columns.find((c) => c.targetField === 'posPin');
      expect(pinCol).toBeDefined();
    });

    it('detects role pattern from data', () => {
      const headers = ['name', 'access'];
      const sampleRows = [
        ['John', 'manager'],
        ['Jane', 'cashier'],
        ['Bob', 'server'],
        ['Alice', 'bartender'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      const roleCol = result.columns.find((c) => c.targetField === 'role');
      expect(roleCol).toBeDefined();
    });
  });

  describe('greedy assignment', () => {
    it('does not assign the same target to multiple columns', () => {
      const headers = ['email_address', 'email_backup'];
      const sampleRows = [
        ['john@test.com', 'john.backup@test.com'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      const emailMappings = result.columns.filter((c) => c.targetField === 'email');
      expect(emailMappings).toHaveLength(1);
    });

    it('prefers higher-confidence matches in greedy assignment', () => {
      const headers = ['email', 'mail_address'];
      const sampleRows = [
        ['john@test.com', 'secondary@test.com'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      const emailCol = result.columns.find((c) => c.targetField === 'email');
      expect(emailCol).toBeDefined();
      expect(emailCol!.sourceHeader).toBe('email');
    });
  });

  describe('unmapped columns', () => {
    it('leaves unknown columns as unmapped (targetField: null)', () => {
      const headers = ['First Name', 'Last Name', 'Random Gibberish Column'];
      const sampleRows = [
        ['John', 'Doe', 'xyz'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      const unmapped = result.columns.find((c) => c.targetField === null);
      expect(unmapped).toBeDefined();
      expect(unmapped!.sourceHeader).toBe('Random Gibberish Column');
      expect(unmapped!.confidence).toBe(0);
    });
  });

  describe('warnings', () => {
    it('warns when no email or username columns found', () => {
      const headers = ['col1'];
      const sampleRows = [['abc']];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      expect(result.warnings.some((w) => w.includes('email or username'))).toBe(true);
    });

    it('warns when no name columns found', () => {
      const headers = ['email'];
      const sampleRows = [['john@test.com']];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      expect(result.warnings.some((w) => w.includes('name'))).toBe(true);
    });

    it('does not warn when identity and name columns exist', () => {
      const headers = ['first_name', 'last_name', 'email'];
      const sampleRows = [['John', 'Doe', 'john@test.com']];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('distinct values extraction', () => {
    it('extracts distinct role values', () => {
      const headers = ['first_name', 'role'];
      const allRows = [
        ['John', 'Manager'],
        ['Jane', 'Cashier'],
        ['Bob', 'Manager'],
        ['Alice', 'Server'],
      ];
      const result = analyzeStaffColumns(headers, allRows, allRows);

      expect(result.distinctRoles).toEqual(['Cashier', 'Manager', 'Server']);
    });

    it('extracts distinct location values', () => {
      const headers = ['first_name', 'location'];
      const allRows = [
        ['John', 'Main Club'],
        ['Jane', 'Pro Shop'],
        ['Bob', 'Main Club'],
      ];
      const result = analyzeStaffColumns(headers, allRows, allRows);

      expect(result.distinctLocations).toEqual(['Main Club', 'Pro Shop']);
    });

    it('returns empty arrays when no role/location columns mapped', () => {
      const headers = ['first_name', 'email'];
      const sampleRows = [['John', 'john@test.com']];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      expect(result.distinctRoles).toEqual([]);
      expect(result.distinctLocations).toEqual([]);
    });
  });

  describe('combined scoring', () => {
    it('boosts confidence when alias and pattern agree', () => {
      const headers = ['email'];
      const sampleRows = [
        ['john@test.com'],
        ['jane@test.com'],
        ['bob@test.com'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      const emailCol = result.columns.find((c) => c.targetField === 'email');
      expect(emailCol).toBeDefined();
      // Combined should be higher than alias alone (95) due to pattern agreement
      expect(emailCol!.confidence).toBeGreaterThanOrEqual(95);
    });
  });

  describe('sparse data penalty', () => {
    it('reduces confidence for mostly-empty columns via pattern detection', () => {
      // Use a header that won't alias-match to anything
      const headers = ['first_name', 'col_xyz'];
      const sampleRows = [
        ['John', ''],
        ['Jane', ''],
        ['Bob', ''],
        ['Alice', ''],
        ['Charlie', 'manager'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      // The 'col_xyz' column has only 20% fill rate, so pattern-based confidence is reduced
      const col = result.columns.find((c) => c.sourceHeader === 'col_xyz');
      expect(col).toBeDefined();
      // With sparse data and no alias match, it should either be unmapped or have low confidence
      if (col!.targetField) {
        expect(col!.confidence).toBeLessThan(85);
      } else {
        expect(col!.confidence).toBe(0);
      }
    });
  });

  describe('realistic scenarios', () => {
    it('handles typical golf club export', () => {
      const headers = [
        'Employee ID', 'First Name', 'Last Name', 'Email Address',
        'Access Level', 'Location', 'Status', 'Clock In PIN',
      ];
      const sampleRows = [
        ['EMP001', 'John', 'Doe', 'john@club.com', 'Pro Shop', 'Main Clubhouse', 'Active', '1234'],
        ['EMP002', 'Jane', 'Smith', 'jane@club.com', 'Manager', 'Restaurant', 'Active', '5678'],
        ['EMP003', 'Bob', 'Jones', 'bob@club.com', 'Cashier', 'Pro Shop', 'Inactive', '9012'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      expect(result.columns.find((c) => c.targetField === 'externalPayrollEmployeeId')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'firstName')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'lastName')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'email')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'role')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'location')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'status')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'posPin')).toBeDefined();
      expect(result.totalRows).toBe(3);
    });

    it('handles restaurant POS export', () => {
      const headers = ['Name', 'Login', 'User Type', 'Active', 'Pin'];
      const sampleRows = [
        ['John Doe', 'jdoe', 'Server', 'Yes', '1234'],
        ['Jane Smith', 'jsmith', 'Bartender', 'Yes', '5678'],
        ['Bob Wilson', 'bwilson', 'Cook', 'No', '9012'],
      ];
      const result = analyzeStaffColumns(headers, sampleRows, sampleRows);

      expect(result.columns.find((c) => c.targetField === 'username')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'role')).toBeDefined();
      expect(result.columns.find((c) => c.targetField === 'status')).toBeDefined();
    });
  });
});
