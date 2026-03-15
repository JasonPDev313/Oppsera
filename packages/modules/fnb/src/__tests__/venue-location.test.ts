import { describe, expect, it } from 'vitest';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { assertSingleVenueLocation, withEffectiveLocationId } from '../helpers/venue-location';

function makeCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'site-1',
    requestId: 'req-1',
    isPlatformAdmin: false,
    user: {
      id: 'user-1',
      email: 'user@example.com',
      tenantId: 'tenant-1',
      activeTenantId: 'tenant-1',
      roles: [],
      permissions: [],
    },
    ...overrides,
  } as RequestContext;
}

describe('venue-location helpers', () => {
  it('returns the single venue location when all values match', () => {
    expect(assertSingleVenueLocation(['venue-1', 'venue-1'], 'tables')).toBe('venue-1');
  });

  it('ignores nullish values when one venue remains', () => {
    expect(assertSingleVenueLocation([null, 'venue-1', undefined], 'tables')).toBe('venue-1');
  });

  it('throws when tables span multiple venues', () => {
    expect(() => assertSingleVenueLocation(['venue-1', 'venue-2'], 'tables')).toThrowError(AppError);
    expect(() => assertSingleVenueLocation(['venue-1', 'venue-2'], 'tables')).toThrow(/same venue/);
  });

  it('returns the same context object when the location does not change', () => {
    const ctx = makeCtx({ locationId: 'venue-1' });

    expect(withEffectiveLocationId(ctx, 'venue-1')).toBe(ctx);
  });

  it('returns a cloned context when the location changes', () => {
    const ctx = makeCtx({ locationId: 'site-1' });
    const updated = withEffectiveLocationId(ctx, 'venue-1');

    expect(updated).not.toBe(ctx);
    expect(updated.locationId).toBe('venue-1');
    expect(updated.tenantId).toBe(ctx.tenantId);
    expect(updated.user.id).toBe(ctx.user.id);
  });
});
