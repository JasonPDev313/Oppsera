import { describe, it, expect } from 'vitest';

import {
  ImpersonationRestrictionError,
  isImpersonating,
  assertImpersonationCanVoid,
  assertImpersonationCanRefund,
  assertImpersonationCanModifyAccounting,
  assertImpersonationCanDelete,
  assertImpersonationCanModifyPermissions,
  assertNotImpersonating,
} from '../auth/impersonation-safety';
import type { RequestContext } from '../auth/context';

// ── Helpers ────────────────────────────────────────────────────────

function makeCtx(impersonation?: boolean): RequestContext {
  const ctx: RequestContext = {
    user: { id: 'user_01', email: 'u@test.com', name: 'Test', tenantId: 'tnt_01', tenantStatus: 'active', membershipStatus: 'active' },
    tenantId: 'tnt_01',
    requestId: 'req_01',
    isPlatformAdmin: false,
  };
  if (impersonation) {
    ctx.impersonation = {
      adminId: 'admin_01',
      adminEmail: 'admin@oppsera.com',
      sessionId: 'session_01',
      tenantId: 'tnt_01',
      tenantName: 'Test Tenant',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  }
  return ctx;
}

// ── Tests ────────────────────────────────────────────────────────

describe('ImpersonationRestrictionError', () => {
  it('has code IMPERSONATION_RESTRICTED and status 403', () => {
    const err = new ImpersonationRestrictionError('blocked');
    expect(err.code).toBe('IMPERSONATION_RESTRICTED');
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('blocked');
  });
});

describe('isImpersonating', () => {
  it('returns false when not impersonating', () => {
    expect(isImpersonating(makeCtx(false))).toBe(false);
  });

  it('returns true when impersonating', () => {
    expect(isImpersonating(makeCtx(true))).toBe(true);
  });
});

describe('assertImpersonationCanVoid', () => {
  it('does nothing when not impersonating', () => {
    expect(() => assertImpersonationCanVoid(makeCtx(false), 999999)).not.toThrow();
  });

  it('allows void under $500 during impersonation', () => {
    expect(() => assertImpersonationCanVoid(makeCtx(true), 49999)).not.toThrow();
  });

  it('allows void at exactly $500 during impersonation', () => {
    expect(() => assertImpersonationCanVoid(makeCtx(true), 50000)).not.toThrow();
  });

  it('blocks void over $500 during impersonation', () => {
    expect(() => assertImpersonationCanVoid(makeCtx(true), 50001)).toThrow(ImpersonationRestrictionError);
  });

  it('includes amount in error message', () => {
    try {
      assertImpersonationCanVoid(makeCtx(true), 75000);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ImpersonationRestrictionError).message).toContain('$750.00');
    }
  });
});

describe('assertImpersonationCanRefund', () => {
  it('does nothing when not impersonating', () => {
    expect(() => assertImpersonationCanRefund(makeCtx(false), 999999)).not.toThrow();
  });

  it('allows refund under $500 during impersonation', () => {
    expect(() => assertImpersonationCanRefund(makeCtx(true), 25000)).not.toThrow();
  });

  it('allows refund at exactly $500 during impersonation', () => {
    expect(() => assertImpersonationCanRefund(makeCtx(true), 50000)).not.toThrow();
  });

  it('blocks refund over $500 during impersonation', () => {
    expect(() => assertImpersonationCanRefund(makeCtx(true), 50001)).toThrow(ImpersonationRestrictionError);
  });

  it('includes amount in error message', () => {
    try {
      assertImpersonationCanRefund(makeCtx(true), 100000);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ImpersonationRestrictionError).message).toContain('$1000.00');
    }
  });
});

describe('assertImpersonationCanModifyAccounting', () => {
  it('does nothing when not impersonating', () => {
    expect(() => assertImpersonationCanModifyAccounting(makeCtx(false))).not.toThrow();
  });

  it('always blocks during impersonation', () => {
    expect(() => assertImpersonationCanModifyAccounting(makeCtx(true))).toThrow(ImpersonationRestrictionError);
  });

  it('error message mentions accounting settings', () => {
    try {
      assertImpersonationCanModifyAccounting(makeCtx(true));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ImpersonationRestrictionError).message).toContain('accounting settings');
    }
  });
});

describe('assertImpersonationCanDelete', () => {
  it('does nothing when not impersonating', () => {
    expect(() => assertImpersonationCanDelete(makeCtx(false))).not.toThrow();
  });

  it('always blocks during impersonation', () => {
    expect(() => assertImpersonationCanDelete(makeCtx(true))).toThrow(ImpersonationRestrictionError);
  });

  it('error message mentions delete', () => {
    try {
      assertImpersonationCanDelete(makeCtx(true));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ImpersonationRestrictionError).message).toContain('delete');
    }
  });
});

describe('assertImpersonationCanModifyPermissions', () => {
  it('does nothing when not impersonating', () => {
    expect(() => assertImpersonationCanModifyPermissions(makeCtx(false))).not.toThrow();
  });

  it('always blocks during impersonation', () => {
    expect(() => assertImpersonationCanModifyPermissions(makeCtx(true))).toThrow(ImpersonationRestrictionError);
  });

  it('error message mentions permissions', () => {
    try {
      assertImpersonationCanModifyPermissions(makeCtx(true));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ImpersonationRestrictionError).message).toContain('permissions');
    }
  });
});

describe('assertNotImpersonating', () => {
  it('does nothing when not impersonating', () => {
    expect(() => assertNotImpersonating(makeCtx(false), 'test action')).not.toThrow();
  });

  it('always blocks during impersonation', () => {
    expect(() => assertNotImpersonating(makeCtx(true), 'test action')).toThrow(ImpersonationRestrictionError);
  });

  it('includes the action name in error message', () => {
    try {
      assertNotImpersonating(makeCtx(true), 'export data');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ImpersonationRestrictionError).message).toContain('export data');
    }
  });
});
