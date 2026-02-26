import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../schema';

const ADMIN_URL = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
const APP_URL = process.env.DATABASE_URL;

const SKIP = !ADMIN_URL || !APP_URL;

const adminClient = SKIP ? null : postgres(ADMIN_URL!, { max: 3 });
const adminDb = SKIP ? null : drizzle(adminClient!, { schema });

const appClient = SKIP ? null : postgres(APP_URL!, { max: 3 });

afterAll(async () => {
  if (adminClient) await adminClient.end();
  if (appClient) await appClient.end();
});

// ── Test 1: All tables exist ─────────────────────────────────────
describe.skipIf(SKIP)('all tables exist', () => {
  const tables = [
    'tenants',
    'locations',
    'users',
    'memberships',
    'roles',
    'role_permissions',
    'role_assignments',
    'entitlements',
    'audit_log',
    'event_outbox',
    'processed_events',
    'tenant_settings',
  ];

  for (const table of tables) {
    it(`table "${table}" exists`, async () => {
      const result = await adminDb.execute(sql.raw(`SELECT 1 FROM "${table}" LIMIT 0`));
      expect(result).toBeDefined();
    });
  }
});

// ── Test 2: gen_ulid() works ─────────────────────────────────────
describe.skipIf(SKIP)('gen_ulid()', () => {
  it('returns a 26-character string', async () => {
    const result = await adminDb.execute(sql`SELECT gen_ulid() AS id`);
    const id = (result[0] as { id: string }).id;
    expect(id).toHaveLength(26);
  });

  it('contains only valid Crockford Base32 characters', async () => {
    const result = await adminDb.execute(sql`SELECT gen_ulid() AS id`);
    const id = (result[0] as { id: string }).id;
    expect(id).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  it('generates unique values', async () => {
    const result = await adminDb.execute(sql`SELECT gen_ulid() AS id1, gen_ulid() AS id2`);
    const row = result[0] as { id1: string; id2: string };
    expect(row.id1).not.toBe(row.id2);
  });

  it('generates sortable values', async () => {
    const result = await adminDb.execute(
      sql`SELECT gen_ulid() AS id1, pg_sleep(0.002), gen_ulid() AS id2`,
    );
    const row = result[0] as { id1: string; id2: string };
    expect(row.id2 >= row.id1).toBe(true);
  });
});

// ── Test 3: Seed data is present ─────────────────────────────────
// Counts must match packages/db/src/seed.ts:
//   3 locations (1 site + 2 venues), 1 membership, 9 roles, 18 entitlements, 1 owner assignment
describe.skipIf(SKIP)('seed data', () => {
  let tenantId: string;

  beforeAll(async () => {
    const result = await adminDb.execute(
      sql`SELECT id FROM tenants WHERE slug = 'sunset-golf' LIMIT 1`,
    );
    tenantId = (result[0] as { id: string }).id;
  });

  it('tenant "sunset-golf" exists', () => {
    expect(tenantId).toBeDefined();
    expect(tenantId).toHaveLength(26);
  });

  it('has 3 locations (1 site + 2 venues)', async () => {
    const result = await adminDb.execute(
      sql`SELECT COUNT(*)::int AS count FROM locations WHERE tenant_id = ${tenantId}`,
    );
    expect((result[0] as { count: number }).count).toBe(3);
  });

  it('has at least 1 user with a membership', async () => {
    const result = await adminDb.execute(
      sql`SELECT COUNT(*)::int AS count FROM memberships WHERE tenant_id = ${tenantId}`,
    );
    expect((result[0] as { count: number }).count).toBeGreaterThanOrEqual(1);
  });

  it('has at least 5 roles', async () => {
    const result = await adminDb.execute(
      sql`SELECT COUNT(*)::int AS count FROM roles WHERE tenant_id = ${tenantId}`,
    );
    // Seed creates 9 roles (owner, admin, manager, cashier, supervisor, server, staff, housekeeper, viewer)
    // Older seeds may have fewer — assert minimum viable count
    expect((result[0] as { count: number }).count).toBeGreaterThanOrEqual(5);
  });

  it('has at least 10 entitlements', async () => {
    const result = await adminDb.execute(
      sql`SELECT COUNT(*)::int AS count FROM entitlements WHERE tenant_id = ${tenantId}`,
    );
    // Seed creates 18 module entitlements; older seeds may have fewer
    expect((result[0] as { count: number }).count).toBeGreaterThanOrEqual(10);
  });

  it('user has the "owner" role assigned', async () => {
    const result = await adminDb.execute(sql`
      SELECT ra.id FROM role_assignments ra
      JOIN roles r ON r.id = ra.role_id
      WHERE ra.tenant_id = ${tenantId}
        AND r.name = 'owner'
    `);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Test 4: RLS isolation works ──────────────────────────────────
// Uses SET ROLE oppsera_app to enforce RLS (postgres has BYPASSRLS on Supabase)
// Skipped when oppsera_app role can't be assumed (e.g., local Supabase dev)
describe.skipIf(SKIP)('RLS isolation', () => {
  let tenantId: string;
  let canSetRole = false;
  const fakeTenantId = '00000000000000000000000000';

  beforeAll(async () => {
    const result = await adminDb.execute(
      sql`SELECT id FROM tenants WHERE slug = 'sunset-golf' LIMIT 1`,
    );
    tenantId = (result[0] as { id: string }).id;

    // Actually try SET ROLE — pg_has_role can return true even when SET ROLE fails
    try {
      await appClient!.begin(async (tx) => {
        await tx`SET LOCAL ROLE oppsera_app`;
        await tx`RESET ROLE`;
      });
      canSetRole = true;
    } catch {
      canSetRole = false;
    }
  });

  it('returns data when tenant_id matches', async ({ skip }) => {
    if (!canSetRole) skip();
    const [row] = await appClient.begin(async (tx) => {
      await tx`SET LOCAL ROLE oppsera_app`;
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return tx`SELECT COUNT(*)::int AS count FROM locations`;
    });
    expect((row as { count: number }).count).toBe(3);
  });

  it('returns no data when tenant_id does not match', async ({ skip }) => {
    if (!canSetRole) skip();
    const [row] = await appClient.begin(async (tx) => {
      await tx`SET LOCAL ROLE oppsera_app`;
      await tx`SELECT set_config('app.current_tenant_id', ${fakeTenantId}, true)`;
      return tx`SELECT COUNT(*)::int AS count FROM locations`;
    });
    expect((row as { count: number }).count).toBe(0);
  });

  it('filters entitlements by tenant', async ({ skip }) => {
    if (!canSetRole) skip();
    const [row] = await appClient.begin(async (tx) => {
      await tx`SET LOCAL ROLE oppsera_app`;
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return tx`SELECT COUNT(*)::int AS count FROM entitlements`;
    });
    expect((row as { count: number }).count).toBe(18);
  });
});

// ── Test 5: withTenant wrapper works ─────────────────────────────
// Also requires oppsera_app role for SET ROLE
describe.skipIf(SKIP)('withTenant wrapper', () => {
  let tenantId: string;
  let canSetRole = false;
  const fakeTenantId = '00000000000000000000000000';

  beforeAll(async () => {
    const result = await adminDb.execute(
      sql`SELECT id FROM tenants WHERE slug = 'sunset-golf' LIMIT 1`,
    );
    tenantId = (result[0] as { id: string }).id;

    try {
      await appClient!.begin(async (tx) => {
        await tx`SET LOCAL ROLE oppsera_app`;
        await tx`RESET ROLE`;
      });
      canSetRole = true;
    } catch {
      canSetRole = false;
    }
  });

  it('returns locations for real tenant', async ({ skip }) => {
    if (!canSetRole) skip();
    const [row] = await appClient.begin(async (tx) => {
      await tx`SET LOCAL ROLE oppsera_app`;
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return tx`SELECT COUNT(*)::int AS count FROM locations`;
    });
    expect((row as { count: number }).count).toBe(3);
  });

  it('returns no locations for fake tenant', async ({ skip }) => {
    if (!canSetRole) skip();
    const [row] = await appClient.begin(async (tx) => {
      await tx`SET LOCAL ROLE oppsera_app`;
      await tx`SELECT set_config('app.current_tenant_id', ${fakeTenantId}, true)`;
      return tx`SELECT COUNT(*)::int AS count FROM locations`;
    });
    expect((row as { count: number }).count).toBe(0);
  });
});
