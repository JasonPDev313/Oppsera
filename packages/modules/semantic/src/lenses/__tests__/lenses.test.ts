import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @oppsera/db ─────────────────────────────────────────────
// Use vi.hoisted so the object is available inside the vi.mock factory (hoisted to top).

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@oppsera/db', () => ({
  db: mockDb,
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb)),
  semanticLenses: {
    id: 'id',
    tenantId: 'tenant_id',
    slug: 'slug',
    displayName: 'display_name',
    description: 'description',
    domain: 'domain',
    allowedMetrics: 'allowed_metrics',
    allowedDimensions: 'allowed_dimensions',
    defaultMetrics: 'default_metrics',
    defaultDimensions: 'default_dimensions',
    defaultFilters: 'default_filters',
    systemPromptFragment: 'system_prompt_fragment',
    exampleQuestions: 'example_questions',
    isActive: 'is_active',
    isSystem: 'is_system',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  tenantLensPreferences: {
    id: 'id',
    tenantId: 'tenant_id',
    lensSlug: 'lens_slug',
    enabled: 'enabled',
    updatedAt: 'updated_at',
  },
  semanticMetrics: { isActive: 'is_active' },
  semanticDimensions: { isActive: 'is_active' },
  eq: vi.fn((col: unknown, val: unknown) => ({ type: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  inArray: vi.fn(),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'MOCK_ULID'),
}));

// Mock registry to avoid DB calls during validation
vi.mock('../../registry/registry', () => ({
  listMetrics: vi.fn(async () => [
    { slug: 'rounds_played', domain: 'golf' },
    { slug: 'green_fee_revenue', domain: 'golf' },
    { slug: 'net_sales', domain: 'core' },
  ]),
  listDimensions: vi.fn(async () => [
    { slug: 'date', domain: 'core' },
    { slug: 'golf_course', domain: 'golf' },
    { slug: 'booking_channel', domain: 'golf' },
  ]),
}));

import {
  createCustomLens,
  updateCustomLens,
  deactivateCustomLens,
  reactivateCustomLens,
} from '../commands';
import { getCustomLens, listCustomLenses, listAllLensesForTenant } from '../queries';
import { validateLensSlug, validateLensMetricsAndDimensions } from '../validation';
import {
  DuplicateLensSlugError,
  LensNotFoundError,
  SystemLensModificationError,
  InvalidLensSlugError,
} from '../types';

// ── Test helpers ─────────────────────────────────────────────────

function makeLensRow(overrides: Partial<{
  id: string;
  tenantId: string | null;
  slug: string;
  displayName: string;
  description: string | null;
  domain: string;
  allowedMetrics: string[] | null;
  allowedDimensions: string[] | null;
  defaultMetrics: string[] | null;
  defaultDimensions: string[] | null;
  defaultFilters: unknown;
  systemPromptFragment: string | null;
  exampleQuestions: string[] | null;
  isActive: boolean;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'LENS_ID',
    tenantId: 'TENANT_1',
    slug: 'my_lens',
    displayName: 'My Lens',
    description: null,
    domain: 'golf',
    allowedMetrics: ['rounds_played', 'green_fee_revenue'],
    allowedDimensions: ['date', 'golf_course'],
    defaultMetrics: ['rounds_played'],
    defaultDimensions: ['date'],
    defaultFilters: null,
    systemPromptFragment: 'Focus on golf rounds.',
    exampleQuestions: ['How many rounds today?'],
    isActive: true,
    isSystem: false,
    createdAt: new Date('2026-02-20T10:00:00Z'),
    updatedAt: new Date('2026-02-20T10:00:00Z'),
    ...overrides,
  };
}

// Helper to make a chainable mock: select().from().where() -> rows
function makeSelectMock(rows: unknown[]) {
  const chain = { from: vi.fn(), where: vi.fn() };
  chain.from.mockReturnValue(chain);
  chain.where.mockResolvedValue(rows);
  return chain;
}

// Helper to make a chainable insert mock
function makeInsertMock(row: unknown) {
  const chain = { values: vi.fn(), returning: vi.fn() };
  chain.values.mockReturnValue(chain);
  chain.returning.mockResolvedValue([row]);
  return chain;
}

// Helper to make a chainable update mock
function makeUpdateMock(row: unknown) {
  const chain = { set: vi.fn(), where: vi.fn(), returning: vi.fn() };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.returning.mockResolvedValue([row]);
  return chain;
}

// ── validateLensSlug ─────────────────────────────────────────────

describe('validateLensSlug', () => {
  it('accepts valid slugs', () => {
    expect(() => validateLensSlug('my_lens')).not.toThrow();
    expect(() => validateLensSlug('golf_ops')).not.toThrow();
    expect(() => validateLensSlug('ab')).not.toThrow();
    expect(() => validateLensSlug('lens123')).not.toThrow();
  });

  it('rejects slugs starting with non-letter', () => {
    expect(() => validateLensSlug('1abc')).toThrow(InvalidLensSlugError);
    expect(() => validateLensSlug('_abc')).toThrow(InvalidLensSlugError);
  });

  it('rejects single character slugs', () => {
    expect(() => validateLensSlug('a')).toThrow(InvalidLensSlugError);
  });

  it('rejects slugs with uppercase', () => {
    expect(() => validateLensSlug('MyLens')).toThrow(InvalidLensSlugError);
  });

  it('rejects slugs with spaces or hyphens', () => {
    expect(() => validateLensSlug('my lens')).toThrow(InvalidLensSlugError);
    expect(() => validateLensSlug('my-lens')).toThrow(InvalidLensSlugError);
  });

  it('rejects empty slug', () => {
    expect(() => validateLensSlug('')).toThrow(InvalidLensSlugError);
  });
});

// ── validateLensMetricsAndDimensions ─────────────────────────────

describe('validateLensMetricsAndDimensions', () => {
  it('returns valid=true for empty arrays', async () => {
    const result = await validateLensMetricsAndDimensions([], [], [], []);
    expect(result.valid).toBe(true);
  });

  it('returns valid=true for known slugs', async () => {
    const result = await validateLensMetricsAndDimensions(
      ['rounds_played'],
      ['date'],
      ['rounds_played'],
      ['date'],
    );
    expect(result.valid).toBe(true);
  });

  it('returns error for unknown metric slug', async () => {
    const result = await validateLensMetricsAndDimensions(
      ['unknown_metric'],
      [],
      undefined,
      undefined,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown_metric'))).toBe(true);
  });

  it('returns error for unknown dimension slug', async () => {
    const result = await validateLensMetricsAndDimensions(
      [],
      ['unknown_dim'],
      undefined,
      undefined,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown_dim'))).toBe(true);
  });

  it('returns error when defaultMetrics not in allowedMetrics', async () => {
    const result = await validateLensMetricsAndDimensions(
      ['rounds_played'],       // allowedMetrics
      ['date'],                 // allowedDimensions
      ['green_fee_revenue'],    // defaultMetrics — not in allowed!
      ['date'],
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('green_fee_revenue'))).toBe(true);
  });

  it('returns error when defaultDimensions not in allowedDimensions', async () => {
    const result = await validateLensMetricsAndDimensions(
      ['rounds_played'],
      ['date'],
      ['rounds_played'],
      ['golf_course'],  // not in allowedDimensions=['date']
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('golf_course'))).toBe(true);
  });

  it('handles undefined inputs without error', async () => {
    const result = await validateLensMetricsAndDimensions(
      undefined, undefined, undefined, undefined,
    );
    expect(result.valid).toBe(true);
  });
});

// ── createCustomLens ─────────────────────────────────────────────

describe('createCustomLens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a lens and returns the row', async () => {
    const row = makeLensRow();
    // First select: check for duplicate (returns empty)
    mockDb.select.mockReturnValueOnce(makeSelectMock([]));
    // Insert: returns the new row
    mockDb.insert.mockReturnValueOnce(makeInsertMock(row));

    const result = await createCustomLens({
      tenantId: 'TENANT_1',
      slug: 'my_lens',
      displayName: 'My Lens',
      domain: 'golf',
      allowedMetrics: ['rounds_played'],
      allowedDimensions: ['date'],
    });

    expect(result.slug).toBe('my_lens');
    expect(result.tenantId).toBe('TENANT_1');
    expect(result.isActive).toBe(true);
  });

  it('throws DuplicateLensSlugError when slug already exists', async () => {
    // Select returns an existing row
    mockDb.select.mockReturnValueOnce(makeSelectMock([{ id: 'EXISTING' }]));

    await expect(
      createCustomLens({
        tenantId: 'TENANT_1',
        slug: 'my_lens',
        displayName: 'My Lens',
        domain: 'golf',
      }),
    ).rejects.toThrow(DuplicateLensSlugError);
  });

  it('throws InvalidLensSlugError for bad slug format', async () => {
    await expect(
      createCustomLens({
        tenantId: 'TENANT_1',
        slug: 'My Lens!',
        displayName: 'My Lens',
        domain: 'golf',
      }),
    ).rejects.toThrow(InvalidLensSlugError);
  });

  it('throws validation error for unknown metric slug', async () => {
    await expect(
      createCustomLens({
        tenantId: 'TENANT_1',
        slug: 'my_lens',
        displayName: 'My Lens',
        domain: 'golf',
        allowedMetrics: ['nonexistent_metric'],
      }),
    ).rejects.toThrow(/Lens validation failed/);
  });
});

// ── updateCustomLens ─────────────────────────────────────────────

describe('updateCustomLens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a custom lens', async () => {
    const existing = makeLensRow();
    const updated = makeLensRow({ displayName: 'Updated Lens' });

    mockDb.select.mockReturnValueOnce(makeSelectMock([existing]));
    mockDb.update.mockReturnValueOnce(makeUpdateMock(updated));

    const result = await updateCustomLens({
      tenantId: 'TENANT_1',
      slug: 'my_lens',
      displayName: 'Updated Lens',
    });

    expect(result.displayName).toBe('Updated Lens');
  });

  it('throws LensNotFoundError when lens does not exist', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectMock([]));

    await expect(
      updateCustomLens({ tenantId: 'TENANT_1', slug: 'nonexistent' }),
    ).rejects.toThrow(LensNotFoundError);
  });

  it('throws SystemLensModificationError for system lenses', async () => {
    const sysLens = makeLensRow({ isSystem: true, tenantId: null });
    mockDb.select.mockReturnValueOnce(makeSelectMock([sysLens]));

    await expect(
      updateCustomLens({ tenantId: 'TENANT_1', slug: 'golf_operations' }),
    ).rejects.toThrow(SystemLensModificationError);
  });
});

// ── deactivateCustomLens ─────────────────────────────────────────

describe('deactivateCustomLens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deactivates a custom lens', async () => {
    const existing = makeLensRow();
    const deactivated = makeLensRow({ isActive: false });

    mockDb.select.mockReturnValueOnce(makeSelectMock([existing]));
    mockDb.update.mockReturnValueOnce(makeUpdateMock(deactivated));

    const result = await deactivateCustomLens('TENANT_1', 'my_lens');
    expect(result.isActive).toBe(false);
  });

  it('throws LensNotFoundError when not found', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectMock([]));
    await expect(deactivateCustomLens('TENANT_1', 'nonexistent')).rejects.toThrow(LensNotFoundError);
  });

  it('throws SystemLensModificationError for system lens', async () => {
    const sysLens = makeLensRow({ isSystem: true });
    mockDb.select.mockReturnValueOnce(makeSelectMock([sysLens]));
    await expect(deactivateCustomLens('TENANT_1', 'golf_ops')).rejects.toThrow(SystemLensModificationError);
  });
});

// ── reactivateCustomLens ─────────────────────────────────────────

describe('reactivateCustomLens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reactivates a deactivated lens', async () => {
    const existing = makeLensRow({ isActive: false });
    const reactivated = makeLensRow({ isActive: true });

    mockDb.select.mockReturnValueOnce(makeSelectMock([existing]));
    mockDb.update.mockReturnValueOnce(makeUpdateMock(reactivated));

    const result = await reactivateCustomLens('TENANT_1', 'my_lens');
    expect(result.isActive).toBe(true);
  });
});

// ── getCustomLens ─────────────────────────────────────────────────

describe('getCustomLens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the lens when found', async () => {
    const row = makeLensRow();
    mockDb.select.mockReturnValueOnce(makeSelectMock([row]));

    const result = await getCustomLens('TENANT_1', 'my_lens');
    expect(result.slug).toBe('my_lens');
    expect(result.tenantId).toBe('TENANT_1');
  });

  it('throws LensNotFoundError when not found', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectMock([]));
    await expect(getCustomLens('TENANT_1', 'missing')).rejects.toThrow(LensNotFoundError);
  });
});

// ── listCustomLenses ──────────────────────────────────────────────

describe('listCustomLenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all active custom lenses for tenant', async () => {
    const rows = [makeLensRow(), makeLensRow({ slug: 'second_lens' })];
    mockDb.select.mockReturnValueOnce(makeSelectMock(rows));

    const result = await listCustomLenses({ tenantId: 'TENANT_1' });
    expect(result).toHaveLength(2);
  });

  it('filters by domain', async () => {
    const rows = [
      makeLensRow({ domain: 'golf' }),
      makeLensRow({ slug: 'sales_lens', domain: 'core' }),
    ];
    mockDb.select.mockReturnValueOnce(makeSelectMock(rows));

    const result = await listCustomLenses({ tenantId: 'TENANT_1', domain: 'golf' });
    expect(result).toHaveLength(1);
    expect(result[0]!.domain).toBe('golf');
  });

  it('returns empty array when no lenses', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectMock([]));

    const result = await listCustomLenses({ tenantId: 'TENANT_1' });
    expect(result).toHaveLength(0);
  });
});

// ── listAllLensesForTenant ────────────────────────────────────────

describe('listAllLensesForTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns system and custom lenses merged', async () => {
    const sysLens = makeLensRow({ tenantId: null, isSystem: true, slug: 'golf_ops' });
    const customLens = makeLensRow({ isSystem: false, slug: 'my_lens' });

    mockDb.select.mockReturnValueOnce(makeSelectMock([sysLens, customLens]));

    const result = await listAllLensesForTenant('TENANT_1');
    expect(result).toHaveLength(2);
    expect(result.some((l) => l.isSystem)).toBe(true);
    expect(result.some((l) => !l.isSystem)).toBe(true);
  });

  it('filters by domain', async () => {
    const sysLens = makeLensRow({ tenantId: null, isSystem: true, slug: 'golf_ops', domain: 'golf' });
    const coreLens = makeLensRow({ isSystem: false, slug: 'my_core_lens', domain: 'core' });

    mockDb.select.mockReturnValueOnce(makeSelectMock([sysLens, coreLens]));

    const result = await listAllLensesForTenant('TENANT_1', 'golf');
    expect(result.every((l) => l.domain === 'golf')).toBe(true);
  });
});

// ── Error class properties ────────────────────────────────────────

describe('Custom lens error classes', () => {
  it('DuplicateLensSlugError has slug and tenantId', () => {
    const err = new DuplicateLensSlugError('my_lens', 'T1');
    expect(err.slug).toBe('my_lens');
    expect(err.tenantId).toBe('T1');
    expect(err.name).toBe('DuplicateLensSlugError');
  });

  it('LensNotFoundError has slug', () => {
    const err = new LensNotFoundError('missing');
    expect(err.slug).toBe('missing');
    expect(err.name).toBe('LensNotFoundError');
  });

  it('SystemLensModificationError has slug', () => {
    const err = new SystemLensModificationError('golf_ops');
    expect(err.slug).toBe('golf_ops');
    expect(err.name).toBe('SystemLensModificationError');
  });

  it('InvalidLensSlugError has slug', () => {
    const err = new InvalidLensSlugError('Bad Slug!');
    expect(err.slug).toBe('Bad Slug!');
    expect(err.name).toBe('InvalidLensSlugError');
  });
});
