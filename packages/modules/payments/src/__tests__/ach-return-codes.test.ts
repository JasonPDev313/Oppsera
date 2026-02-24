import { describe, it, expect } from 'vitest';
import {
  getReturnCode,
  isRetryableReturn,
  getRetryDelayDays,
  classifyReturn,
  getReturnDescription,
  isAdministrativeReturn,
  ALL_RETURN_CODES,
} from '../helpers/ach-return-codes';
import type { AchReturnCategory } from '../helpers/ach-return-codes';

// ── getReturnCode ──────────────────────────────────────────────

describe('getReturnCode', () => {
  it('should return R01 code entry', () => {
    const entry = getReturnCode('R01');
    expect(entry).toBeDefined();
    expect(entry!.code).toBe('R01');
    expect(entry!.description).toBe('Insufficient Funds');
    expect(entry!.category).toBe('nsf');
    expect(entry!.retryable).toBe(true);
    expect(entry!.retryDelayDays).toBe(2);
    expect(entry!.isAdministrative).toBe(false);
  });

  it('should return R02 code entry', () => {
    const entry = getReturnCode('R02');
    expect(entry).toBeDefined();
    expect(entry!.code).toBe('R02');
    expect(entry!.description).toBe('Account Closed');
    expect(entry!.category).toBe('closed');
    expect(entry!.retryable).toBe(false);
  });

  it('should handle lowercase input', () => {
    const entry = getReturnCode('r01');
    expect(entry).toBeDefined();
    expect(entry!.code).toBe('R01');
  });

  it('should handle mixed case input', () => {
    const entry = getReturnCode('r09');
    expect(entry).toBeDefined();
    expect(entry!.code).toBe('R09');
  });

  it('should return undefined for unknown code', () => {
    expect(getReturnCode('R99')).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(getReturnCode('')).toBeUndefined();
  });

  it('should return undefined for garbage input', () => {
    expect(getReturnCode('INVALID')).toBeUndefined();
  });
});

// ── isRetryableReturn ──────────────────────────────────────────

describe('isRetryableReturn', () => {
  it('should return true for R01 (Insufficient Funds)', () => {
    expect(isRetryableReturn('R01')).toBe(true);
  });

  it('should return true for R09 (Uncollected Funds)', () => {
    expect(isRetryableReturn('R09')).toBe(true);
  });

  it('should return false for R02 (Account Closed)', () => {
    expect(isRetryableReturn('R02')).toBe(false);
  });

  it('should return false for R03 (No Account)', () => {
    expect(isRetryableReturn('R03')).toBe(false);
  });

  it('should return false for R07 (Authorization Revoked)', () => {
    expect(isRetryableReturn('R07')).toBe(false);
  });

  it('should return false for administrative returns', () => {
    expect(isRetryableReturn('R06')).toBe(false);
    expect(isRetryableReturn('R61')).toBe(false);
    expect(isRetryableReturn('R67')).toBe(false);
  });

  it('should return false for unknown codes', () => {
    expect(isRetryableReturn('R99')).toBe(false);
  });

  it('should handle lowercase input', () => {
    expect(isRetryableReturn('r01')).toBe(true);
    expect(isRetryableReturn('r09')).toBe(true);
  });
});

// ── getRetryDelayDays ──────────────────────────────────────────

describe('getRetryDelayDays', () => {
  it('should return 2 for R01 (NSF)', () => {
    expect(getRetryDelayDays('R01')).toBe(2);
  });

  it('should return 2 for R09 (Uncollected)', () => {
    expect(getRetryDelayDays('R09')).toBe(2);
  });

  it('should return 0 for non-retryable codes', () => {
    expect(getRetryDelayDays('R02')).toBe(0);
    expect(getRetryDelayDays('R03')).toBe(0);
    expect(getRetryDelayDays('R07')).toBe(0);
  });

  it('should return 0 for unknown codes', () => {
    expect(getRetryDelayDays('R99')).toBe(0);
    expect(getRetryDelayDays('INVALID')).toBe(0);
  });
});

// ── classifyReturn ─────────────────────────────────────────────

describe('classifyReturn', () => {
  const expectedCategories: Array<{ code: string; category: AchReturnCategory }> = [
    { code: 'R01', category: 'nsf' },
    { code: 'R09', category: 'nsf' },
    { code: 'R02', category: 'closed' },
    { code: 'R14', category: 'closed' },
    { code: 'R15', category: 'closed' },
    { code: 'R03', category: 'invalid' },
    { code: 'R04', category: 'invalid' },
    { code: 'R17', category: 'invalid' },
    { code: 'R20', category: 'invalid' },
    { code: 'R21', category: 'invalid' },
    { code: 'R22', category: 'invalid' },
    { code: 'R80', category: 'invalid' },
    { code: 'R05', category: 'unauthorized' },
    { code: 'R07', category: 'unauthorized' },
    { code: 'R08', category: 'unauthorized' },
    { code: 'R10', category: 'unauthorized' },
    { code: 'R23', category: 'unauthorized' },
    { code: 'R29', category: 'unauthorized' },
    { code: 'R06', category: 'admin' },
    { code: 'R12', category: 'admin' },
    { code: 'R13', category: 'admin' },
    { code: 'R24', category: 'admin' },
    { code: 'R61', category: 'admin' },
    { code: 'R67', category: 'admin' },
    { code: 'R68', category: 'admin' },
    { code: 'R69', category: 'admin' },
    { code: 'R70', category: 'admin' },
    { code: 'R83', category: 'admin' },
    { code: 'R16', category: 'regulatory' },
    { code: 'R11', category: 'other' },
    { code: 'R31', category: 'other' },
    { code: 'R33', category: 'other' },
    { code: 'R51', category: 'other' },
  ];

  it.each(expectedCategories)(
    'should classify $code as $category',
    ({ code, category }) => {
      expect(classifyReturn(code)).toBe(category);
    },
  );

  it('should return "other" for unknown codes', () => {
    expect(classifyReturn('R99')).toBe('other');
    expect(classifyReturn('INVALID')).toBe('other');
    expect(classifyReturn('')).toBe('other');
  });
});

// ── getReturnDescription ───────────────────────────────────────

describe('getReturnDescription', () => {
  it('should return description for R01', () => {
    expect(getReturnDescription('R01')).toBe('Insufficient Funds');
  });

  it('should return description for R02', () => {
    expect(getReturnDescription('R02')).toBe('Account Closed');
  });

  it('should return description for R07', () => {
    expect(getReturnDescription('R07')).toBe('Authorization Revoked by Customer');
  });

  it('should return description for R16 (OFAC)', () => {
    expect(getReturnDescription('R16')).toBe('Account Frozen / Entry Returned per OFAC Instruction');
  });

  it('should return fallback for unknown code', () => {
    expect(getReturnDescription('R99')).toBe('Unknown return code: R99');
  });

  it('should return fallback for garbage input', () => {
    expect(getReturnDescription('XYZ')).toBe('Unknown return code: XYZ');
  });

  it('should handle lowercase input', () => {
    expect(getReturnDescription('r01')).toBe('Insufficient Funds');
  });
});

// ── isAdministrativeReturn ─────────────────────────────────────

describe('isAdministrativeReturn', () => {
  const adminCodes = ['R06', 'R12', 'R13', 'R24', 'R61', 'R67', 'R68', 'R69', 'R70', 'R83'];
  const nonAdminCodes = ['R01', 'R02', 'R03', 'R04', 'R05', 'R07', 'R08', 'R09', 'R10', 'R16'];

  it.each(adminCodes)('should return true for %s', (code) => {
    expect(isAdministrativeReturn(code)).toBe(true);
  });

  it.each(nonAdminCodes)('should return false for %s', (code) => {
    expect(isAdministrativeReturn(code)).toBe(false);
  });

  it('should return false for unknown codes', () => {
    expect(isAdministrativeReturn('R99')).toBe(false);
    expect(isAdministrativeReturn('')).toBe(false);
  });

  it('should handle lowercase input', () => {
    expect(isAdministrativeReturn('r06')).toBe(true);
    expect(isAdministrativeReturn('r61')).toBe(true);
  });
});

// ── ALL_RETURN_CODES ───────────────────────────────────────────

describe('ALL_RETURN_CODES', () => {
  it('should be an array of all known codes', () => {
    expect(Array.isArray(ALL_RETURN_CODES)).toBe(true);
    expect(ALL_RETURN_CODES.length).toBeGreaterThan(25);
  });

  it('should contain R01', () => {
    expect(ALL_RETURN_CODES.find((c) => c.code === 'R01')).toBeDefined();
  });

  it('should contain R83', () => {
    expect(ALL_RETURN_CODES.find((c) => c.code === 'R83')).toBeDefined();
  });

  it('should have all required fields on each entry', () => {
    for (const entry of ALL_RETURN_CODES) {
      expect(typeof entry.code).toBe('string');
      expect(entry.code).toMatch(/^R\d+$/);
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
      expect(typeof entry.category).toBe('string');
      expect(typeof entry.retryable).toBe('boolean');
      expect(typeof entry.retryDelayDays).toBe('number');
      expect(typeof entry.isAdministrative).toBe('boolean');
    }
  });

  it('only retryable codes should have nonzero retryDelayDays', () => {
    for (const entry of ALL_RETURN_CODES) {
      if (entry.retryable) {
        expect(entry.retryDelayDays).toBeGreaterThan(0);
      } else {
        expect(entry.retryDelayDays).toBe(0);
      }
    }
  });

  it('only R01 and R09 should be retryable', () => {
    const retryable = ALL_RETURN_CODES.filter((c) => c.retryable);
    expect(retryable.map((c) => c.code).sort()).toEqual(['R01', 'R09']);
  });
});

// ── ACH Status Transition Coverage ─────────────────────────────

describe('ACH return code coverage', () => {
  it('every category should have at least one code', () => {
    const categories = new Set(ALL_RETURN_CODES.map((c) => c.category));
    expect(categories.has('nsf')).toBe(true);
    expect(categories.has('closed')).toBe(true);
    expect(categories.has('invalid')).toBe(true);
    expect(categories.has('unauthorized')).toBe(true);
    expect(categories.has('admin')).toBe(true);
    expect(categories.has('other')).toBe(true);
  });

  it('nsf codes should be retryable', () => {
    const nsfCodes = ALL_RETURN_CODES.filter((c) => c.category === 'nsf');
    for (const code of nsfCodes) {
      expect(code.retryable).toBe(true);
    }
  });

  it('unauthorized codes should NOT be retryable', () => {
    const unauthorizedCodes = ALL_RETURN_CODES.filter((c) => c.category === 'unauthorized');
    for (const code of unauthorizedCodes) {
      expect(code.retryable).toBe(false);
    }
  });

  it('closed codes should NOT be retryable', () => {
    const closedCodes = ALL_RETURN_CODES.filter((c) => c.category === 'closed');
    for (const code of closedCodes) {
      expect(code.retryable).toBe(false);
    }
  });

  it('admin codes should all be administrative', () => {
    const adminCodes = ALL_RETURN_CODES.filter((c) => c.category === 'admin');
    for (const code of adminCodes) {
      expect(code.isAdministrative).toBe(true);
    }
  });

  it('non-admin codes should NOT be administrative', () => {
    const nonAdmin = ALL_RETURN_CODES.filter((c) => c.category !== 'admin');
    for (const code of nonAdmin) {
      expect(code.isAdministrative).toBe(false);
    }
  });
});
