import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db, tenants } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim() ?? '';

    if (q.length < 2) {
      return NextResponse.json({ data: [] });
    }

    const term = `%${q}%`;
    const rows = await db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
      .from(tenants)
      .where(sql`(${tenants.name} ILIKE ${term} OR ${tenants.slug} ILIKE ${term}) AND ${tenants.status} = 'active'`)
      .limit(10);

    return NextResponse.json({
      data: Array.from(rows as Iterable<{ id: string; name: string; slug: string }>),
    });
  } catch (err: unknown) {
    console.error('Tenant search error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Search failed' } },
      { status: 500 },
    );
  }
}
