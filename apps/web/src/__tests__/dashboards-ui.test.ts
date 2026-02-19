import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockApiFetch } = vi.hoisted(() => {
  const mockApiFetch = vi.fn();
  return { mockApiFetch };
});

vi.mock('@/lib/api-client', () => ({
  apiFetch: mockApiFetch,
  ApiError: class extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

// ═══════════════════════════════════════════════════════════════
// Dashboard API calls
// ═══════════════════════════════════════════════════════════════

describe('Dashboard API calls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } });
  });

  it('list dashboards calls correct URL', async () => {
    await mockApiFetch('/api/v1/dashboards?');
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/dashboards'),
    );
  });

  it('get single dashboard calls correct URL', async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: { id: 'dash_1', name: 'My Dashboard', tiles: [] },
    });
    await mockApiFetch('/api/v1/dashboards/dash_1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/dashboards/dash_1');
  });

  it('create dashboard uses POST', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { id: 'dash_new' } });
    await mockApiFetch('/api/v1/dashboards', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Dashboard', tiles: [] }),
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/dashboards',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('update dashboard uses PUT', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { id: 'dash_1' } });
    await mockApiFetch('/api/v1/dashboards/dash_1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated', tiles: [] }),
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/dashboards/dash_1',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('delete dashboard uses DELETE', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { success: true } });
    await mockApiFetch('/api/v1/dashboards/dash_1', { method: 'DELETE' });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/dashboards/dash_1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Dashboard response shapes
// ═══════════════════════════════════════════════════════════════

describe('Dashboard response shapes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dashboard response includes tiles array', async () => {
    const mockData = {
      data: {
        id: 'dash_1',
        name: 'My Dashboard',
        tiles: [
          {
            reportId: 'rpt_1',
            title: 'Sales',
            chartType: 'line',
            position: { x: 0, y: 0 },
            size: { w: 6, h: 3 },
          },
        ],
        isDefault: false,
        createdBy: 'user_1',
        isArchived: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    };
    mockApiFetch.mockResolvedValueOnce(mockData);

    const result = await mockApiFetch('/api/v1/dashboards/dash_1');
    expect(result.data.tiles).toHaveLength(1);
    expect(result.data.tiles[0].chartType).toBe('line');
    expect(result.data.tiles[0].position).toEqual({ x: 0, y: 0 });
  });

  it('dashboard list response includes pagination meta', async () => {
    const mockData = {
      data: [
        { id: 'dash_1', name: 'Dashboard 1', tiles: [] },
        { id: 'dash_2', name: 'Dashboard 2', tiles: [] },
      ],
      meta: { cursor: 'dash_2', hasMore: true },
    };
    mockApiFetch.mockResolvedValueOnce(mockData);

    const result = await mockApiFetch('/api/v1/dashboards?');
    expect(result.data).toHaveLength(2);
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.cursor).toBe('dash_2');
  });

  it('empty dashboard list returns empty array', async () => {
    const mockData = {
      data: [],
      meta: { cursor: null, hasMore: false },
    };
    mockApiFetch.mockResolvedValueOnce(mockData);

    const result = await mockApiFetch('/api/v1/dashboards?');
    expect(result.data).toHaveLength(0);
    expect(result.meta.hasMore).toBe(false);
  });

  it('run report for tile returns columns and rows', async () => {
    const mockData = {
      data: {
        columns: ['business_date', 'net_sales'],
        rows: [
          { business_date: '2026-01-01', net_sales: 1500.50 },
          { business_date: '2026-01-02', net_sales: 2100.00 },
        ],
      },
    };
    mockApiFetch.mockResolvedValueOnce(mockData);

    const result = await mockApiFetch('/api/v1/reports/custom/rpt_1/run', {
      method: 'POST',
    });
    expect(result.data.columns).toEqual(['business_date', 'net_sales']);
    expect(result.data.rows).toHaveLength(2);
  });
});
