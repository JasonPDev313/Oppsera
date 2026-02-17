import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, ilike, or } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, memberships, users } from '@oppsera/db';

// GET /api/v1/team-members?search=xxx — list active tenant members
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim() ?? '';

    const baseConditions = and(
      eq(memberships.tenantId, ctx.tenantId),
      eq(memberships.status, 'active'),
    );

    const whereClause = search.length >= 1
      ? and(
          baseConditions,
          or(
            ilike(users.name, `%${search}%`),
            ilike(users.email, `%${search}%`),
          ),
        )
      : baseConditions;

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(whereClause)
      .orderBy(users.name)
      .limit(50);

    return NextResponse.json({ data: rows });
  },
  { permission: 'orders.create' },
);
