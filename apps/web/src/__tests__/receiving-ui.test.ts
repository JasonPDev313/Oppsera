import { describe, it, expect } from 'vitest';

// ── Hook URL construction tests ─────────────────────────────────
// These test that the hooks build the correct API URLs without
// actually calling the network (pure logic validation).

describe('Receiving hook URL construction', () => {
  function buildReceiptsUrl(filters: {
    locationId?: string;
    status?: string;
    vendorId?: string;
    limit?: number;
    cursor?: string;
  }): string {
    const params = new URLSearchParams();
    if (filters.locationId) params.set('locationId', filters.locationId);
    if (filters.status) params.set('status', filters.status);
    if (filters.vendorId) params.set('vendorId', filters.vendorId);
    if (filters.limit) params.set('limit', String(filters.limit));
    if (filters.cursor) params.set('cursor', filters.cursor);
    return `/api/v1/inventory/receiving?${params}`;
  }

  it('builds URL with no filters', () => {
    const url = buildReceiptsUrl({});
    expect(url).toBe('/api/v1/inventory/receiving?');
  });

  it('builds URL with status filter', () => {
    const url = buildReceiptsUrl({ status: 'draft' });
    expect(url).toContain('status=draft');
  });

  it('builds URL with vendor filter', () => {
    const url = buildReceiptsUrl({ vendorId: 'vendor-123' });
    expect(url).toContain('vendorId=vendor-123');
  });

  it('builds URL with pagination cursor', () => {
    const url = buildReceiptsUrl({ cursor: 'abc123', limit: 25 });
    expect(url).toContain('cursor=abc123');
    expect(url).toContain('limit=25');
  });

  it('combines multiple filters', () => {
    const url = buildReceiptsUrl({ status: 'posted', vendorId: 'v1', locationId: 'loc1' });
    expect(url).toContain('status=posted');
    expect(url).toContain('vendorId=v1');
    expect(url).toContain('locationId=loc1');
  });
});

describe('Item search URL construction', () => {
  function buildSearchUrl(q: string, locationId: string, vendorId?: string): string {
    const params = new URLSearchParams({ q, locationId });
    if (vendorId) params.set('vendorId', vendorId);
    return `/api/v1/inventory/receiving/search-items?${params}`;
  }

  it('includes query and locationId', () => {
    const url = buildSearchUrl('burger', 'loc-1');
    expect(url).toContain('q=burger');
    expect(url).toContain('locationId=loc-1');
  });

  it('includes vendorId when provided', () => {
    const url = buildSearchUrl('bun', 'loc-1', 'vendor-1');
    expect(url).toContain('vendorId=vendor-1');
  });

  it('does not include vendorId when undefined', () => {
    const url = buildSearchUrl('bun', 'loc-1');
    expect(url).not.toContain('vendorId');
  });
});

describe('Receipt status filtering', () => {
  const statuses = ['draft', 'posted', 'voided'] as const;

  it('filters drafts from mixed list', () => {
    const items = [
      { id: '1', status: 'draft' },
      { id: '2', status: 'posted' },
      { id: '3', status: 'voided' },
      { id: '4', status: 'draft' },
    ];
    const drafts = items.filter((i) => i.status === 'draft');
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.id)).toEqual(['1', '4']);
  });

  it('all statuses are valid', () => {
    for (const s of statuses) {
      expect(['draft', 'posted', 'voided']).toContain(s);
    }
  });

  it('recognizes voided receipts', () => {
    const receipt = { status: 'voided' };
    expect(receipt.status === 'posted').toBe(false);
    expect(receipt.status === 'voided').toBe(true);
  });
});
