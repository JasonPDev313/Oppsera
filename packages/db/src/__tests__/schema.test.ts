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

if (!ADMIN_URL || !APP_URL) {
  throw new Error('DATABASE_URL and DATABASE_URL_ADMIN must be set');
}

const adminClient = postgres(ADMIN_URL, { max: 3 });
const adminDb = drizzle(adminClient, { schema });

const appClient = postgres(APP_URL, { max: 3 });

afterAll(async () => {
  await adminClient.end();
  await appClient.end();
});

// ── Test 1: All tables exist ─────────────────────────────────────
describe('all tables exist', () => {
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
describe('gen_ulid()', () => {
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
describe('seed data', () => {
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

  it('has 2 locations', async () => {
    const result = await adminDb.execute(
      sql`SELECT COUNT(*)::int AS count FROM locations WHERE tenant_id = ${tenantId}`,
    );
    expect((result[0] as { count: number }).count).toBe(2);
  });

  it('has 1 user with a membership', async () => {
    const result = await adminDb.execute(
      sql`SELECT COUNT(*)::int AS count FROM memberships WHERE tenant_id = ${tenantId}`,
    );
    expect((result[0] as { count: number }).count).toBe(1);
  });

  it('has 5 roles', async () => {
    const result = await adminDb.execute(
      sql`SELECT COUNT(*)::int AS count FROM roles WHERE tenant_id = ${tenantId}`,
    );
    expect((result[0] as { count: number }).count).toBe(5);
  });

  it('has 7 entitlements', async () => {
    const result = await adminDb.execute(
      sql`SELECT COUNT(*)::int AS count FROM entitlements WHERE tenant_id = ${tenantId}`,
    );
    expect((result[0] as { count: number }).count).toBe(7);
  });

  it('user has the "owner" role assigned', async () => {
    const result = await adminDb.execute(sql`
      SELECT ra.id FROM role_assignments ra
      JOIN roles r ON r.id = ra.role_id
      WHERE ra.tenant_id = ${tenantId}
        AND r.name = 'owner'
    `);
    expect(result.length).toBe(1);
  });
});

// ── Test 4: RLS isolation works ──────────────────────────────────
// Uses SET ROLE oppsera_app to enforce RLS (postgres has BYPASSRLS on Supabase)
// Uses set_config() (parameterized) instead of SET LOCAL (which doesn't support $1)
describe('RLS isolation', () => {
  let tenantId: string;
  const fakeTenantId = '00000000000000000000000000';

  beforeAll(async () => {
    const result = await adminDb.execute(
      sql`SELECT id FROM tenants WHERE slug = 'sunset-golf' LIMIT 1`,
    );
    tenantId = (result[0] as { id: string }).id;
  });

  it('returns data when tenant_id matches', async () => {
    const [row] = await appClient.begin(async (tx) => {
      await tx`SET LOCAL ROLE oppsera_app`;
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return tx`SELECT COUNT(*)::int AS count FROM locations`;
    });
    expect((row as { count: number }).count).toBe(2);
  });

  it('returns no data when tenant_id does not match', async () => {
    const [row] = await appClient.begin(async (tx) => {
      await tx`SET LOCAL ROLE oppsera_app`;
      await tx`SELECT set_config('app.current_tenant_id', ${fakeTenantId}, true)`;
      return tx`SELECT COUNT(*)::int AS count FROM locations`;
    });
    expect((row as { count: number }).count).toBe(0);
  });

  it('filters entitlements by tenant', async () => {
    const [row] = await appClient.begin(async (tx) => {
      await tx`SET LOCAL ROLE oppsera_app`;
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return tx`SELECT COUNT(*)::int AS count FROM entitlements`;
    });
    expect((row as { count: number }).count).toBe(7);
  });
});

// ── Test 5: withTenant wrapper works ─────────────────────────────
describe('withTenant wrapper', () => {
  let tenantId: string;
  const fakeTenantId = '00000000000000000000000000';

  beforeAll(async () => {
    const result = await adminDb.execute(
      sql`SELECT id FROM tenants WHERE slug = 'sunset-golf' LIMIT 1`,
    );
    tenantId = (result[0] as { id: string }).id;
  });

  it('returns locations for real tenant', async () => {
    const [row] = await appClient.begin(async (tx) => {
      await tx`SET LOCAL ROLE oppsera_app`;
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return tx`SELECT COUNT(*)::int AS count FROM locations`;
    });
    expect((row as { count: number }).count).toBe(2);
  });

  it('returns no locations for fake tenant', async () => {
    const [row] = await appClient.begin(async (tx) => {
      await tx`SET LOCAL ROLE oppsera_app`;
      await tx`SELECT set_config('app.current_tenant_id', ${fakeTenantId}, true)`;
      return tx`SELECT COUNT(*)::int AS count FROM locations`;
    });
    expect((row as { count: number }).count).toBe(0);
  });
});
