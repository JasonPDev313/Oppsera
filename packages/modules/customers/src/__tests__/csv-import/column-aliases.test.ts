import { describe, it, expect } from 'vitest';
import { TARGET_FIELDS, COLUMN_ALIASES, getTargetFieldByKey } from '../../services/csv-import/column-aliases';

describe('column-aliases', () => {
  describe('TARGET_FIELDS', () => {
    it('has at least 40 target fields', () => {
      expect(TARGET_FIELDS.length).toBeGreaterThanOrEqual(40);
    });

    it('every field has required properties', () => {
      for (const field of TARGET_FIELDS) {
        expect(field.key).toBeTruthy();
        expect(field.label).toBeTruthy();
        expect(field.table).toBeTruthy();
        expect(field.group).toBeTruthy();
        expect(typeof field.required).toBe('boolean');
        expect(['string', 'boolean', 'number', 'date', 'enum']).toContain(field.dataType);
      }
    });

    it('has no duplicate keys', () => {
      const keys = TARGET_FIELDS.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('groups cover all expected categories', () => {
      const groups = new Set(TARGET_FIELDS.map((f) => f.group));
      expect(groups.has('identity')).toBe(true);
      expect(groups.has('contact')).toBe(true);
      expect(groups.has('address')).toBe(true);
      expect(groups.has('demographics')).toBe(true);
      expect(groups.has('financial')).toBe(true);
      expect(groups.has('marketing')).toBe(true);
    });
  });

  describe('COLUMN_ALIASES', () => {
    it('has aliases for firstName', () => {
      const firstNameAliases = COLUMN_ALIASES['firstName'];
      expect(firstNameAliases).toBeDefined();
      expect(firstNameAliases).toContain('first name');
      expect(firstNameAliases).toContain('firstname');
      expect(firstNameAliases).toContain('fname');
    });

    it('has aliases for lastName', () => {
      const lastNameAliases = COLUMN_ALIASES['lastName'];
      expect(lastNameAliases).toBeDefined();
      expect(lastNameAliases).toContain('last name');
      expect(lastNameAliases).toContain('lastname');
      expect(lastNameAliases).toContain('lname');
    });

    it('has aliases for email', () => {
      const emailAliases = COLUMN_ALIASES['email'];
      expect(emailAliases).toBeDefined();
      expect(emailAliases).toContain('email');
      expect(emailAliases).toContain('email address');
    });

    it('has aliases for phone', () => {
      const phoneAliases = COLUMN_ALIASES['phone'];
      expect(phoneAliases).toBeDefined();
      expect(phoneAliases).toContain('phone');
      expect(phoneAliases).toContain('mobile');
    });

    it('has aliases for memberNumber', () => {
      const aliases = COLUMN_ALIASES['memberNumber'];
      expect(aliases).toBeDefined();
      expect(aliases).toContain('member number');
      expect(aliases).toContain('mbr_no');
    });

    it('has aliases for fullName', () => {
      const aliases = COLUMN_ALIASES['fullName'];
      expect(aliases).toBeDefined();
      expect(aliases).toContain('full name');
      expect(aliases).toContain('name');
    });

    it('has no cross-field collisions', () => {
      const allAliases = new Map<string, string>();
      for (const [fieldKey, aliases] of Object.entries(COLUMN_ALIASES)) {
        for (const alias of aliases) {
          if (allAliases.has(alias)) {
            // Fail with useful message
            expect(`${alias} -> ${fieldKey}`).toBe(`${alias} -> ${allAliases.get(alias)} (collision)`);
          }
          allAliases.set(alias, fieldKey);
        }
      }
    });

    it('every alias key references a valid TARGET_FIELDS key', () => {
      const validKeys = new Set(TARGET_FIELDS.map((f) => f.key));
      for (const fieldKey of Object.keys(COLUMN_ALIASES)) {
        expect(validKeys.has(fieldKey)).toBe(true);
      }
    });
  });

  describe('getTargetFieldByKey', () => {
    it('returns field for valid key', () => {
      const field = getTargetFieldByKey('firstName');
      expect(field).toBeDefined();
      expect(field?.label).toBe('First Name');
    });

    it('returns undefined for invalid key', () => {
      expect(getTargetFieldByKey('nonexistent')).toBeUndefined();
    });
  });
});
