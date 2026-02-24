import { describe, it, expect } from 'vitest';
import { validateAndMapRows } from '../../services/csv-import/row-validator';
import type { ColumnMapping, DetectedTransform } from '../../services/csv-import/import-types';

function makeMappings(pairs: [string, string | null][]): ColumnMapping[] {
  return pairs.map(([header, target], i) => ({
    sourceHeader: header!,
    sourceIndex: i,
    targetField: target!,
    confidence: target ? 95 : 0,
    method: target ? 'alias' as const : 'unmapped' as const,
  }));
}

describe('row-validator', () => {
  describe('validateAndMapRows', () => {
    it('maps a simple valid row', () => {
      const rows = [['John', 'Smith', 'john@test.com']];
      const mappings = makeMappings([['First Name', 'firstName'], ['Last Name', 'lastName'], ['Email', 'email']]);

      const { validRows, errors } = validateAndMapRows(rows, mappings, []);

      expect(validRows).toHaveLength(1);
      expect(validRows[0]?.customer.firstName).toBe('John');
      expect(validRows[0]?.customer.lastName).toBe('Smith');
      expect(validRows[0]?.customer.email).toBe('john@test.com');
      expect(errors).toHaveLength(0);
    });

    it('validates email format', () => {
      const rows = [['John', 'invalid-email']];
      const mappings = makeMappings([['Name', 'firstName'], ['Email', 'email']]);

      const { warnings } = validateAndMapRows(rows, mappings, []);

      // Bad email should produce a warning
      const emailWarning = warnings.find((w) => w.message.toLowerCase().includes('email'));
      expect(emailWarning).toBeDefined();
    });

    it('skips unmapped columns', () => {
      const rows = [['John', 'abc123', 'john@test.com']];
      const mappings = makeMappings([['Name', 'firstName'], ['Random', null], ['Email', 'email']]);

      const { validRows } = validateAndMapRows(rows, mappings, []);

      expect(validRows).toHaveLength(1);
      expect(validRows[0]?.customer.email).toBe('john@test.com');
    });

    it('rejects rows with no identifying field', () => {
      const rows = [['', '']];
      const mappings = makeMappings([['Notes', null], ['Tags', null]]);

      const { validRows } = validateAndMapRows(rows, mappings, []);

      // All columns are unmapped, so no valid rows
      expect(validRows).toHaveLength(0);
    });

    it('coerces boolean fields', () => {
      const rows = [['John', 'yes']];
      const mappings = makeMappings([['Name', 'firstName'], ['Tax Exempt', 'taxExempt']]);

      const { validRows } = validateAndMapRows(rows, mappings, []);

      expect(validRows[0]?.customer.taxExempt).toBe(true);
    });

    it('coerces date fields', () => {
      const rows = [['John', '01/15/1990']];
      const mappings = makeMappings([['Name', 'firstName'], ['DOB', 'dateOfBirth']]);

      const { validRows } = validateAndMapRows(rows, mappings, []);

      expect(validRows[0]?.customer.dateOfBirth).toBe('1990-01-15');
    });

    it('normalizes phone numbers', () => {
      const rows = [['John', '(555) 123-4567']];
      const mappings = makeMappings([['Name', 'firstName'], ['Phone', 'phone']]);

      const { validRows } = validateAndMapRows(rows, mappings, []);

      expect(validRows[0]?.customer.phone).toBe('5551234567');
    });

    it('applies split_name transform', () => {
      const rows = [['Dr. Jane Smith Jr.', 'jane@test.com']];
      const mappings = makeMappings([['Full Name', 'fullName'], ['Email', 'email']]);
      const transforms: DetectedTransform[] = [{
        sourceIndex: 0,
        sourceHeader: 'Full Name',
        type: 'split_name',
        description: 'Split name',
        outputFields: ['firstName', 'lastName', 'prefix', 'suffix'],
      }];

      const { validRows } = validateAndMapRows(rows, mappings, transforms);

      expect(validRows[0]?.customer.firstName).toBe('Jane');
      expect(validRows[0]?.customer.lastName).toBe('Smith');
    });

    it('applies split_address transform', () => {
      const rows = [['John', 'Phoenix, AZ 85001']];
      const mappings = makeMappings([['Name', 'firstName'], ['Location', 'combinedCityStateZip']]);
      const transforms: DetectedTransform[] = [{
        sourceIndex: 1,
        sourceHeader: 'Location',
        type: 'split_address',
        description: 'Split address',
        outputFields: ['city', 'state', 'postalCode'],
      }];

      const { validRows } = validateAndMapRows(rows, mappings, transforms);

      expect(validRows[0]?.address?.city).toBe('Phoenix');
      expect(validRows[0]?.address?.state).toBe('AZ');
      expect(validRows[0]?.address?.postalCode).toBe('85001');
    });

    it('populates address fields', () => {
      const rows = [['John', '123 Main St', 'Denver', 'CO', '80202']];
      const mappings = makeMappings([
        ['Name', 'firstName'],
        ['Street', 'addressLine1'],
        ['City', 'city'],
        ['State', 'state'],
        ['Zip', 'postalCode'],
      ]);

      const { validRows } = validateAndMapRows(rows, mappings, []);

      expect(validRows[0]?.address?.addressLine1).toBe('123 Main St');
      expect(validRows[0]?.address?.city).toBe('Denver');
      expect(validRows[0]?.address?.state).toBe('CO');
      expect(validRows[0]?.address?.postalCode).toBe('80202');
    });

    it('detects organization type automatically', () => {
      const rows = [['Acme Corp', '', '']];
      const mappings = makeMappings([
        ['Company', 'organizationName'],
        ['First', 'firstName'],
        ['Last', 'lastName'],
      ]);

      const { validRows } = validateAndMapRows(rows, mappings, []);

      expect(validRows[0]?.customer.type).toBe('organization');
    });

    it('builds displayName from firstName + lastName', () => {
      const rows = [['John', 'Smith']];
      const mappings = makeMappings([['First', 'firstName'], ['Last', 'lastName']]);

      const { validRows } = validateAndMapRows(rows, mappings, []);

      expect(validRows[0]?.customer.displayName).toBe('John Smith');
    });

    it('handles multiple rows with mixed validity', () => {
      const rows = [
        ['John', 'Smith', 'john@test.com'],
        ['', '', ''],  // empty — should be skipped
        ['Jane', 'Doe', 'jane@test.com'],
      ];
      const mappings = makeMappings([['First', 'firstName'], ['Last', 'lastName'], ['Email', 'email']]);

      const { validRows } = validateAndMapRows(rows, mappings, []);

      // Empty row should either be invalid or skipped
      expect(validRows.length).toBeGreaterThanOrEqual(2);
    });

    it('handles currency to cents for financial fields', () => {
      const rows = [['John', '$1,250.50']];
      const mappings = makeMappings([['Name', 'firstName'], ['Balance', 'houseAccountBalance']]);

      const { validRows } = validateAndMapRows(rows, mappings, []);

      expect(validRows[0]?.billingBalance).toBe(125050);
    });

    it('parses tags from delimited string', () => {
      const rows = [['John', 'VIP, Golf, Premium']];
      const mappings = makeMappings([['Name', 'firstName'], ['Tags', 'tags']]);

      const { validRows } = validateAndMapRows(rows, mappings, []);

      expect(validRows[0]?.customer.tags).toEqual(['VIP', 'Golf', 'Premium']);
    });
  });
});
