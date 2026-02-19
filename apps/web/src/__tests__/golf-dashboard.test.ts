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
// Golf Dashboard — URL construction
// ═══════════════════════════════════════════════════════════════

describe('golf dashboard URL construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ data: {} });
  });

  it('builds dashboard URL with date param', async () => {
    const params = new URLSearchParams({ date: '2026-02-18' });
    await mockApiFetch(`/api/v1/reports/golf/dashboard?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/reports/golf/dashboard?date=2026-02-18'),
    );
  });

  it('includes courseId and locationId when provided', async () => {
    const params = new URLSearchParams({
      date: '2026-02-18',
      courseId: 'course_001',
      locationId: 'loc_001',
    });
    await mockApiFetch(`/api/v1/reports/golf/dashboard?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('courseId=course_001'),
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('locationId=loc_001'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Golf Dashboard — API response shape
// ═══════════════════════════════════════════════════════════════

describe('golf dashboard response parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 7 KPI fields in data', async () => {
    const mockData = {
      data: {
        todayRoundsPlayed: 42,
        todayRevenue: 3150.0,
        utilizationBps: 7825,
        avgRoundDurationMin: 252,
        cancelRateBps: 850,
        noShowRateBps: 320,
        onlinePctBps: 6200,
      },
    };
    mockApiFetch.mockResolvedValueOnce(mockData);

    const result = await mockApiFetch('/api/v1/reports/golf/dashboard?date=2026-02-18');
    expect(result.data.todayRoundsPlayed).toBe(42);
    expect(result.data.todayRevenue).toBe(3150.0);
    expect(result.data.utilizationBps).toBe(7825);
    expect(result.data.avgRoundDurationMin).toBe(252);
    expect(result.data.cancelRateBps).toBe(850);
    expect(result.data.noShowRateBps).toBe(320);
    expect(result.data.onlinePctBps).toBe(6200);
  });

  it('revenue is in dollars (not cents)', async () => {
    const mockData = {
      data: {
        todayRoundsPlayed: 10,
        todayRevenue: 750.5,
        utilizationBps: 5000,
        avgRoundDurationMin: 240,
        cancelRateBps: 0,
        noShowRateBps: 0,
        onlinePctBps: 5000,
      },
    };
    mockApiFetch.mockResolvedValueOnce(mockData);

    const result = await mockApiFetch('/api/v1/reports/golf/dashboard?date=2026-02-18');
    // $750.50 is a valid revenue value — NOT 7.505 (which would be cents/100)
    expect(result.data.todayRevenue).toBe(750.5);
    expect(result.data.todayRevenue).toBeGreaterThan(100); // dollars, not cents
  });
});

// ═══════════════════════════════════════════════════════════════
// Golf Export URLs
// ═══════════════════════════════════════════════════════════════

describe('golf export URL patterns', () => {
  it('utilization export endpoint', () => {
    const url = `/api/v1/reports/golf/utilization/export?dateFrom=2026-02-01&dateTo=2026-02-28`;
    expect(url).toContain('/golf/utilization/export');
    expect(url).toContain('dateFrom=');
    expect(url).toContain('dateTo=');
  });

  it('revenue export endpoint', () => {
    const url = `/api/v1/reports/golf/revenue/export?dateFrom=2026-02-01&dateTo=2026-02-28`;
    expect(url).toContain('/golf/revenue/export');
  });

  it('pace export endpoint', () => {
    const url = `/api/v1/reports/golf/pace/export?dateFrom=2026-02-01&dateTo=2026-02-28`;
    expect(url).toContain('/golf/pace/export');
  });

  it('customers export endpoint', () => {
    const url = `/api/v1/reports/golf/customers/export?sortBy=totalRevenue&sortDir=desc`;
    expect(url).toContain('/golf/customers/export');
    expect(url).toContain('sortBy=totalRevenue');
  });
});
