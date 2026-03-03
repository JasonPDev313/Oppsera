import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/search/recent — Recent searches for current admin ──

export const GET = withAdminPermission(
  async (_req, session) => {
    const items = await withAdminDb(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT id, search_query, entity_type, entity_id, entity_label, searched_at
        FROM admin_recent_searches
        WHERE admin_id = ${session.adminId}
        ORDER BY searched_at DESC
        LIMIT 20
      `);
      return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        searchQuery: r.search_query as string | null,
        entityType: r.entity_type as string | null,
        entityId: r.entity_id as string | null,
        entityLabel: r.entity_label as string,
        searchedAt: r.searched_at instanceof Date ? r.searched_at.toISOString() : String(r.searched_at),
      }));
    });
    return NextResponse.json({ data: items });
  },
  { permission: 'tenants.read' },
);

// ── POST /api/v1/search/recent — Save a search/navigation event ──

export const POST = withAdminPermission(
  async (req, session) => {
    const body = await req.json();
    const { query, entity_type, entity_id, entity_label } = body as {
      query?: string;
      entity_type?: string;
      entity_id?: string;
      entity_label: string;
    };

    if (!entity_label) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'entity_label is required' } },
        { status: 400 },
      );
    }

    await withAdminDb(async (tx) => {
      // Insert new entry
      await tx.execute(sql`
        INSERT INTO admin_recent_searches (admin_id, search_query, entity_type, entity_id, entity_label)
        VALUES (${session.adminId}, ${query ?? null}, ${entity_type ?? null}, ${entity_id ?? null}, ${entity_label})
      `);

      // Cleanup: keep only last 50 per admin
      await tx.execute(sql`
        DELETE FROM admin_recent_searches
        WHERE id IN (
          SELECT id FROM admin_recent_searches
          WHERE admin_id = ${session.adminId}
          ORDER BY searched_at DESC
          OFFSET 50
        )
      `);
    });

    return NextResponse.json({ data: { ok: true } }, { status: 201 });
  },
  { permission: 'tenants.read' },
);
