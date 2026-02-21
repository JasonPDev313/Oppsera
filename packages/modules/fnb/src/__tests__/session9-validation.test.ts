import { describe, it, expect } from 'vitest';
import {
  TIP_POOL_TYPES, TIP_POOL_SCOPES, TIP_DISTRIBUTION_METHODS, TIP_OUT_CALC_METHODS,
  createTipPoolSchema,
  updateTipPoolSchema,
  addPoolParticipantSchema,
  removePoolParticipantSchema,
  distributeTipPoolSchema,
  declareCashTipsSchema,
  recordTipOutSchema,
  listTipPoolsSchema,
  getTipPoolDetailSchema,
  listTipDeclarationsSchema,
  listTipOutEntriesSchema,
  getTipPoolDistributionsSchema,
} from '../validation';

// ── Enum Constants ──────────────────────────────────────────────

describe('Session 9 Enums', () => {
  it('TIP_POOL_TYPES has expected values', () => {
    expect(TIP_POOL_TYPES).toEqual(['full', 'percentage', 'points']);
  });

  it('TIP_POOL_SCOPES has expected values', () => {
    expect(TIP_POOL_SCOPES).toEqual(['shift', 'daily', 'location']);
  });

  it('TIP_DISTRIBUTION_METHODS has expected values', () => {
    expect(TIP_DISTRIBUTION_METHODS).toEqual(['hours', 'points', 'equal']);
  });

  it('TIP_OUT_CALC_METHODS has expected values', () => {
    expect(TIP_OUT_CALC_METHODS).toEqual(['fixed', 'percentage_of_tips', 'percentage_of_sales']);
  });
});

// ── createTipPoolSchema ─────────────────────────────────────────

describe('createTipPoolSchema', () => {
  const valid = {
    locationId: 'loc-1',
    name: 'Server Pool',
    poolType: 'full' as const,
  };

  it('accepts minimal valid input', () => {
    const result = createTipPoolSchema.parse(valid);
    expect(result.name).toBe('Server Pool');
    expect(result.poolScope).toBe('daily'); // default
    expect(result.distributionMethod).toBe('hours'); // default
    expect(result.isActive).toBe(true); // default
  });

  it('accepts all optional fields', () => {
    const result = createTipPoolSchema.parse({
      ...valid,
      poolType: 'percentage',
      poolScope: 'shift',
      percentageToPool: '20.00',
      distributionMethod: 'points',
      isActive: false,
    });
    expect(result.poolType).toBe('percentage');
    expect(result.percentageToPool).toBe('20.00');
  });

  it('rejects invalid pool type', () => {
    expect(() => createTipPoolSchema.parse({ ...valid, poolType: 'unknown' })).toThrow();
  });

  it('rejects invalid percentage format', () => {
    expect(() => createTipPoolSchema.parse({ ...valid, percentageToPool: 'abc' })).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => createTipPoolSchema.parse({ ...valid, name: '' })).toThrow();
  });
});

// ── updateTipPoolSchema ─────────────────────────────────────────

describe('updateTipPoolSchema', () => {
  it('accepts partial update', () => {
    const result = updateTipPoolSchema.parse({ name: 'Updated Pool' });
    expect(result.name).toBe('Updated Pool');
  });

  it('accepts empty update (all optional)', () => {
    const result = updateTipPoolSchema.parse({});
    expect(result).toBeDefined();
  });

  it('accepts isActive toggle', () => {
    const result = updateTipPoolSchema.parse({ isActive: false });
    expect(result.isActive).toBe(false);
  });
});

// ── addPoolParticipantSchema ────────────────────────────────────

describe('addPoolParticipantSchema', () => {
  const valid = { poolId: 'pool-1', roleId: 'role-1' };

  it('accepts minimal valid input', () => {
    const result = addPoolParticipantSchema.parse(valid);
    expect(result.pointsValue).toBe(10); // default
    expect(result.isContributor).toBe(true); // default
    expect(result.isRecipient).toBe(true); // default
  });

  it('accepts custom points', () => {
    const result = addPoolParticipantSchema.parse({ ...valid, pointsValue: 5 });
    expect(result.pointsValue).toBe(5);
  });

  it('rejects points over 100', () => {
    expect(() => addPoolParticipantSchema.parse({ ...valid, pointsValue: 101 })).toThrow();
  });

  it('rejects points less than 1', () => {
    expect(() => addPoolParticipantSchema.parse({ ...valid, pointsValue: 0 })).toThrow();
  });

  it('rejects missing poolId', () => {
    expect(() => addPoolParticipantSchema.parse({ roleId: 'role-1' })).toThrow();
  });
});

// ── removePoolParticipantSchema ─────────────────────────────────

describe('removePoolParticipantSchema', () => {
  it('accepts valid input', () => {
    const result = removePoolParticipantSchema.parse({ poolId: 'pool-1', roleId: 'role-1' });
    expect(result.poolId).toBe('pool-1');
  });

  it('rejects missing roleId', () => {
    expect(() => removePoolParticipantSchema.parse({ poolId: 'pool-1' })).toThrow();
  });
});

// ── distributeTipPoolSchema ─────────────────────────────────────

describe('distributeTipPoolSchema', () => {
  const valid = {
    poolId: 'pool-1',
    businessDate: '2026-02-21',
    participants: [
      { employeeId: 'emp-1', roleId: 'server', hoursWorked: 8 },
      { employeeId: 'emp-2', roleId: 'busser', hoursWorked: 6 },
    ],
  };

  it('accepts valid input', () => {
    const result = distributeTipPoolSchema.parse(valid);
    expect(result.participants).toHaveLength(2);
    expect(result.participants[0]!.hoursWorked).toBe(8);
  });

  it('defaults hoursWorked to 0', () => {
    const result = distributeTipPoolSchema.parse({
      ...valid,
      participants: [{ employeeId: 'emp-1', roleId: 'server' }],
    });
    expect(result.participants[0]!.hoursWorked).toBe(0);
  });

  it('rejects empty participants array', () => {
    expect(() => distributeTipPoolSchema.parse({ ...valid, participants: [] })).toThrow();
  });

  it('rejects missing businessDate', () => {
    expect(() => distributeTipPoolSchema.parse({ poolId: 'pool-1', participants: valid.participants })).toThrow();
  });
});

// ── declareCashTipsSchema ───────────────────────────────────────

describe('declareCashTipsSchema', () => {
  const valid = {
    serverUserId: 'user-1',
    businessDate: '2026-02-21',
    cashTipsDeclaredCents: 5000,
  };

  it('accepts minimal valid input', () => {
    const result = declareCashTipsSchema.parse(valid);
    expect(result.cashSalesCents).toBe(0); // default
  });

  it('accepts with cash sales', () => {
    const result = declareCashTipsSchema.parse({ ...valid, cashSalesCents: 60000 });
    expect(result.cashSalesCents).toBe(60000);
  });

  it('accepts zero tips declared', () => {
    const result = declareCashTipsSchema.parse({ ...valid, cashTipsDeclaredCents: 0 });
    expect(result.cashTipsDeclaredCents).toBe(0);
  });

  it('rejects negative tips', () => {
    expect(() => declareCashTipsSchema.parse({ ...valid, cashTipsDeclaredCents: -100 })).toThrow();
  });

  it('rejects missing serverUserId', () => {
    expect(() => declareCashTipsSchema.parse({ businessDate: '2026-02-21', cashTipsDeclaredCents: 5000 })).toThrow();
  });
});

// ── recordTipOutSchema ──────────────────────────────────────────

describe('recordTipOutSchema', () => {
  const valid = {
    fromServerUserId: 'user-1',
    toEmployeeId: 'user-2',
    businessDate: '2026-02-21',
    amountCents: 1500,
    calculationMethod: 'fixed' as const,
  };

  it('accepts valid input', () => {
    const result = recordTipOutSchema.parse(valid);
    expect(result.amountCents).toBe(1500);
  });

  it('accepts percentage_of_tips method', () => {
    const result = recordTipOutSchema.parse({
      ...valid,
      calculationMethod: 'percentage_of_tips',
      calculationBasis: '20% of $75.00 tips',
    });
    expect(result.calculationMethod).toBe('percentage_of_tips');
  });

  it('accepts optional fields', () => {
    const result = recordTipOutSchema.parse({
      ...valid,
      toRoleName: 'Busser',
      calculationBasis: 'Standard 20% tip-out',
    });
    expect(result.toRoleName).toBe('Busser');
  });

  it('rejects zero amount', () => {
    expect(() => recordTipOutSchema.parse({ ...valid, amountCents: 0 })).toThrow();
  });

  it('rejects invalid calculation method', () => {
    expect(() => recordTipOutSchema.parse({ ...valid, calculationMethod: 'custom' })).toThrow();
  });
});

// ── Query Filter Schemas ────────────────────────────────────────

describe('listTipPoolsSchema', () => {
  it('accepts valid input with defaults', () => {
    const result = listTipPoolsSchema.parse({ tenantId: 't-1', locationId: 'loc-1' });
    expect(result.isActive).toBe(true); // default
  });

  it('accepts isActive override', () => {
    const result = listTipPoolsSchema.parse({ tenantId: 't-1', locationId: 'loc-1', isActive: false });
    expect(result.isActive).toBe(false);
  });
});

describe('getTipPoolDetailSchema', () => {
  it('accepts valid input', () => {
    const result = getTipPoolDetailSchema.parse({ tenantId: 't-1', poolId: 'pool-1' });
    expect(result.poolId).toBe('pool-1');
  });

  it('rejects missing poolId', () => {
    expect(() => getTipPoolDetailSchema.parse({ tenantId: 't-1' })).toThrow();
  });
});

describe('listTipDeclarationsSchema', () => {
  it('accepts valid input', () => {
    const result = listTipDeclarationsSchema.parse({ tenantId: 't-1', businessDate: '2026-02-21' });
    expect(result.businessDate).toBe('2026-02-21');
  });

  it('accepts optional serverUserId', () => {
    const result = listTipDeclarationsSchema.parse({
      tenantId: 't-1', businessDate: '2026-02-21', serverUserId: 'user-1',
    });
    expect(result.serverUserId).toBe('user-1');
  });
});

describe('listTipOutEntriesSchema', () => {
  it('accepts valid input', () => {
    const result = listTipOutEntriesSchema.parse({ tenantId: 't-1', businessDate: '2026-02-21' });
    expect(result.businessDate).toBe('2026-02-21');
  });

  it('accepts optional serverUserId', () => {
    const result = listTipOutEntriesSchema.parse({
      tenantId: 't-1', businessDate: '2026-02-21', serverUserId: 'user-1',
    });
    expect(result.serverUserId).toBe('user-1');
  });
});

describe('getTipPoolDistributionsSchema', () => {
  it('accepts valid input', () => {
    const result = getTipPoolDistributionsSchema.parse({
      tenantId: 't-1', poolId: 'pool-1', businessDate: '2026-02-21',
    });
    expect(result.poolId).toBe('pool-1');
  });

  it('rejects missing businessDate', () => {
    expect(() => getTipPoolDistributionsSchema.parse({ tenantId: 't-1', poolId: 'pool-1' })).toThrow();
  });
});
