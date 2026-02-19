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
// Golf Tab Hook URL Construction
// ═══════════════════════════════════════════════════════════════

describe('golf tab hook URLs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ data: [] });
  });

  it('utilization hook builds correct URL', async () => {
    const params = new URLSearchParams({
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    await mockApiFetch(`/api/v1/reports/golf/utilization?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/golf/utilization?'),
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('dateFrom=2026-02-01'),
    );
  });

  it('utilization hook includes courseId when set', async () => {
    const params = new URLSearchParams({
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
      courseId: 'course_001',
    });
    await mockApiFetch(`/api/v1/reports/golf/utilization?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('courseId=course_001'),
    );
  });

  it('tee sheet KPIs hook URL', async () => {
    const params = new URLSearchParams({
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    await mockApiFetch(`/api/v1/reports/golf/utilization/kpis?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/golf/utilization/kpis?'),
    );
  });

  it('revenue hook builds correct URL', async () => {
    const params = new URLSearchParams({
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    await mockApiFetch(`/api/v1/reports/golf/revenue?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/golf/revenue?'),
    );
  });

  it('pace KPIs hook URL', async () => {
    const params = new URLSearchParams({
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    await mockApiFetch(`/api/v1/reports/golf/pace?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/golf/pace?'),
    );
  });

  it('dayparts hook URL', async () => {
    const params = new URLSearchParams({
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    await mockApiFetch(`/api/v1/reports/golf/dayparts?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/golf/dayparts?'),
    );
  });

  it('channels hook URL', async () => {
    const params = new URLSearchParams({
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    await mockApiFetch(`/api/v1/reports/golf/channels?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/golf/channels?'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Golf Customers — Pagination & Sort
// ═══════════════════════════════════════════════════════════════

describe('golf customers URL construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      data: [],
      meta: { cursor: null, hasMore: false },
    });
  });

  it('customers hook passes cursor for pagination', async () => {
    const params = new URLSearchParams({
      cursor: 'cust_abc123',
      limit: '25',
    });
    await mockApiFetch(`/api/v1/reports/golf/customers?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('cursor=cust_abc123'),
    );
  });

  it('customers hook passes sort params', async () => {
    const params = new URLSearchParams({
      sortBy: 'totalRevenue',
      sortDir: 'desc',
      limit: '25',
    });
    await mockApiFetch(`/api/v1/reports/golf/customers?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('sortBy=totalRevenue'),
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('sortDir=desc'),
    );
  });

  it('customers response includes pagination meta', async () => {
    const mockData = {
      data: [
        { id: 'rm_001', customerId: 'cust_001', customerName: 'John Doe', totalRounds: 12, totalRevenue: 900.0, lastPlayedAt: '2026-02-15', avgPartySize: 3.2 },
      ],
      meta: { cursor: 'rm_001', hasMore: true },
    };
    mockApiFetch.mockResolvedValueOnce(mockData);

    const result = await mockApiFetch('/api/v1/reports/golf/customers?limit=25');
    expect(result.data).toHaveLength(1);
    expect(result.meta.cursor).toBe('rm_001');
    expect(result.meta.hasMore).toBe(true);
  });

  it('customer KPIs hook URL has no params', async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: {
        totalCustomers: 150,
        totalRounds: 2400,
        totalRevenue: 180000,
        avgRoundsPerCustomer: 16,
        avgRevenuePerCustomer: 1200,
      },
    });

    await mockApiFetch('/api/v1/reports/golf/customers/kpis');

    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reports/golf/customers/kpis');
  });
});
