import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the AI mapper — we only test Tier 1 + integration with Tier 2
vi.mock('../../services/csv-import/ai-column-mapper', () => ({
  callAiColumnMapper: vi.fn().mockResolvedValue([]),
}));

import { detectColumns } from '../../services/csv-import/column-detector';
import { callAiColumnMapper } from '../../services/csv-import/ai-column-mapper';

const mockCallAi = vi.mocked(callAiColumnMapper);

describe('column-detector', () => {
  beforeEach(() => {
    mockCallAi.mockReset();
    mockCallAi.mockResolvedValue([]);
  });

  describe('Tier 1 — alias matching', () => {
    it('matches standard headers with 95% confidence', async () => {
      const headers = ['First Name', 'Last Name', 'Email', 'Phone'];
      const sampleRows = [['John', 'Smith', 'john@test.com', '555-1234']];
      const { mappings } = await detectColumns(headers, sampleRows);

      expect(mappings).toHaveLength(4);
      expect(mappings[0]?.targetField).toBe('firstName');
      expect(mappings[0]?.confidence).toBe(95);
      expect(mappings[0]?.method).toBe('alias');
      expect(mappings[1]?.targetField).toBe('lastName');
      expect(mappings[2]?.targetField).toBe('email');
      expect(mappings[3]?.targetField).toBe('phone');
    });

    it('matches case-insensitive variations', async () => {
      const headers = ['FIRST_NAME', 'LAST_NAME', 'EMAIL_ADDRESS'];
      const sampleRows = [['John', 'Smith', 'john@test.com']];
      const { mappings } = await detectColumns(headers, sampleRows);

      expect(mappings[0]?.targetField).toBe('firstName');
      expect(mappings[1]?.targetField).toBe('lastName');
      expect(mappings[2]?.targetField).toBe('email');
    });

    it('matches ERP aliases (ClubProphet mbr_no)', async () => {
      const headers = ['MBR_NO', 'First_Nm', 'Last_Nm'];
      const sampleRows = [['12345', 'John', 'Smith']];
      const { mappings } = await detectColumns(headers, sampleRows);

      expect(mappings[0]?.targetField).toBe('memberNumber');
      expect(mappings[1]?.targetField).toBe('firstName');
      expect(mappings[2]?.targetField).toBe('lastName');
    });

    it('matches "Full Name" and triggers split_name transform', async () => {
      const headers = ['Full Name', 'Email'];
      const sampleRows = [['John Smith', 'john@test.com']];
      const { mappings, transforms } = await detectColumns(headers, sampleRows);

      expect(mappings[0]?.targetField).toBe('fullName');
      expect(transforms).toHaveLength(1);
      expect(transforms[0]?.type).toBe('split_name');
      expect(transforms[0]?.outputFields).toContain('firstName');
      expect(transforms[0]?.outputFields).toContain('lastName');
    });

    it('leaves unmatched columns as unmapped', async () => {
      const headers = ['First Name', 'Weird Column', 'Email'];
      const sampleRows = [['John', 'abc123', 'john@test.com']];
      const { mappings } = await detectColumns(headers, sampleRows);

      expect(mappings[1]?.targetField).toBeNull();
      expect(mappings[1]?.method).toBe('unmapped');
      expect(mappings[1]?.confidence).toBe(0);
    });

    it('prevents duplicate target field assignments', async () => {
      const headers = ['First Name', 'Given Name', 'Email'];
      const sampleRows = [['John', 'John', 'john@test.com']];
      const { mappings } = await detectColumns(headers, sampleRows);

      // First "First Name" gets mapped, "Given Name" (also alias for firstName) should be unmapped
      const firstNameMappings = mappings.filter((m) => m.targetField === 'firstName');
      expect(firstNameMappings).toHaveLength(1);
    });
  });

  describe('Tier 2 — AI fallback', () => {
    it('calls AI for unmatched columns', async () => {
      const headers = ['First Name', 'Familienname', 'Email'];
      const sampleRows = [['John', 'Smith', 'john@test.com']];

      mockCallAi.mockResolvedValue([
        { sourceHeader: 'Familienname', suggestedField: 'lastName', confidence: 90, reasoning: 'Familienname is German for last name' },
      ]);

      const { mappings } = await detectColumns(headers, sampleRows);

      expect(mockCallAi).toHaveBeenCalledOnce();
      expect(mappings[1]?.targetField).toBe('lastName');
      // AI confidence capped at 85
      expect(mappings[1]?.confidence).toBe(85);
      expect(mappings[1]?.method).toBe('ai');
    });

    it('does not call AI when all columns are matched', async () => {
      const headers = ['First Name', 'Last Name', 'Email'];
      const sampleRows = [['John', 'Smith', 'john@test.com']];

      await detectColumns(headers, sampleRows);

      expect(mockCallAi).not.toHaveBeenCalled();
    });

    it('gracefully handles AI failure', async () => {
      const headers = ['First Name', 'Unknown Col'];
      const sampleRows = [['John', 'abc']];

      mockCallAi.mockRejectedValue(new Error('API timeout'));

      const { mappings } = await detectColumns(headers, sampleRows);

      expect(mappings[1]?.targetField).toBeNull();
      expect(mappings[1]?.method).toBe('unmapped');
    });

    it('caps AI confidence at 85', async () => {
      const headers = ['Weird Header'];
      const sampleRows = [['john@test.com']];

      mockCallAi.mockResolvedValue([
        { sourceHeader: 'Weird Header', suggestedField: 'email', confidence: 99, reasoning: 'test' },
      ]);

      const { mappings } = await detectColumns(headers, sampleRows);
      expect(mappings[0]?.confidence).toBeLessThanOrEqual(85);
    });
  });

  describe('transform detection', () => {
    it('detects "City, ST ZIP" pattern in data', async () => {
      const headers = ['Name', 'Location'];
      const sampleRows = [
        ['John', 'Phoenix, AZ 85001'],
        ['Jane', 'Denver, CO 80202'],
        ['Bob', 'Austin, TX 78701'],
      ];

      const { transforms, mappings } = await detectColumns(headers, sampleRows);

      // "Location" should have been pattern-detected as combinedCityStateZip
      const locationMapping = mappings.find((m) => m.sourceHeader === 'Location');
      expect(locationMapping?.targetField).toBe('combinedCityStateZip');
      expect(transforms.some((t) => t.type === 'split_address')).toBe(true);
    });
  });
});
