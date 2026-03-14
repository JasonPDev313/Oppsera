import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Setup ──────────────────────────────────────────────────────────────

const mockWithTenant = vi.fn();

vi.mock('@oppsera/db', () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
}));

vi.mock('drizzle-orm', () => ({
  sql: vi.fn(),
}));

vi.mock('@oppsera/core/observability', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { handleCourseSent } from '../consumers/handle-course-sent';
import { logger } from '@oppsera/core/observability';

// ── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';
const BASE_DATA = {
  tabId: 'tab-1',
  locationId: 'loc-1',
  courseNumber: 1,
};

describe('handleCourseSent (demoted — verification only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs info when tickets exist for the course', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, cb: (tx: unknown) => unknown) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([{ cnt: 3 }]) };
      return cb(mockTx);
    });

    await handleCourseSent(TENANT_ID, BASE_DATA);

    expect(logger.info).toHaveBeenCalledWith(
      '[kds] handleCourseSent: tickets verified (atomic dispatch)',
      expect.objectContaining({
        domain: 'kds',
        tenantId: TENANT_ID,
        tabId: BASE_DATA.tabId,
        courseNumber: BASE_DATA.courseNumber,
        ticketCount: 3,
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs error when no tickets found (safety net)', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, cb: (tx: unknown) => unknown) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([{ cnt: 0 }]) };
      return cb(mockTx);
    });

    await handleCourseSent(TENANT_ID, BASE_DATA);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('NO TICKETS FOUND'),
      expect.objectContaining({
        domain: 'kds',
        tenantId: TENANT_ID,
        tabId: BASE_DATA.tabId,
        courseNumber: BASE_DATA.courseNumber,
        locationId: BASE_DATA.locationId,
      }),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('logs error when count result is empty', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, cb: (tx: unknown) => unknown) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([]) };
      return cb(mockTx);
    });

    await handleCourseSent(TENANT_ID, BASE_DATA);

    // Empty result → cnt defaults to 0 → logs the "no tickets" error
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('NO TICKETS FOUND'),
      expect.objectContaining({ tabId: BASE_DATA.tabId }),
    );
  });

  it('never throws even if the DB query fails', async () => {
    mockWithTenant.mockRejectedValue(new Error('DB connection timeout'));

    // Should not throw
    await expect(handleCourseSent(TENANT_ID, BASE_DATA)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      '[kds] handleCourseSent: verification failed',
      expect.objectContaining({
        domain: 'kds',
        tenantId: TENANT_ID,
        error: expect.objectContaining({ message: 'DB connection timeout' }),
      }),
    );
  });

  it('treats ticketCount = 1 as success', async () => {
    mockWithTenant.mockImplementation(async (_tid: string, cb: (tx: unknown) => unknown) => {
      const mockTx = { execute: vi.fn().mockResolvedValue([{ cnt: 1 }]) };
      return cb(mockTx);
    });

    await handleCourseSent(TENANT_ID, BASE_DATA);

    expect(logger.info).toHaveBeenCalledWith(
      '[kds] handleCourseSent: tickets verified (atomic dispatch)',
      expect.objectContaining({ ticketCount: 1 }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});
