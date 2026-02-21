import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

export const GET = withAdminAuth(async (_req: NextRequest) => {
  const rows = await db.execute(
    sql`SELECT id, name, description, business_type, is_system, modules, created_by, created_at
        FROM module_templates
        ORDER BY is_system DESC, name ASC`,
  );

  const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    businessType: (r.business_type as string) ?? null,
    isSystem: r.is_system as boolean,
    modules: (r.modules ?? []) as { moduleKey: string; accessMode: string }[],
    createdBy: (r.created_by as string) ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  return NextResponse.json({ data: items });
});

export const POST = withAdminAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  const name = body.name as string | undefined;
  const description = body.description as string | undefined;
  const businessType = body.businessType as string | undefined;
  const modules = body.modules as { moduleKey: string; accessMode: string }[] | undefined;

  if (!name || !modules || !Array.isArray(modules)) {
    return NextResponse.json({ error: { message: 'name and modules are required' } }, { status: 400 });
  }

  const id = generateUlid();
  await db.execute(sql`
    INSERT INTO module_templates (id, name, description, business_type, is_system, modules, created_by)
    VALUES (${id}, ${name}, ${description ?? null}, ${businessType ?? null}, false, ${JSON.stringify(modules)}, ${`admin:${session.adminId}`})
  `);

  return NextResponse.json({ data: { id, name } }, { status: 201 });
}, 'admin');
